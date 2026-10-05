#![no_std]

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    vec, Address, Env, IntoVal, Symbol, Vec,
};

#[contracttype]
#[derive(Clone)]
enum Key {
    Owner,
    Tokens,
    Routers,
    Nonce,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Policy {
    pub amount_in: i128,
    pub deny_approvals: bool,
    pub expires_at: u64,
    pub max_spend: i128,
    pub min_receive: i128,
    pub nonce: u64,
    pub pair: Address,
    pub router: Address,
    pub token_in: Address,
    pub token_out: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Outcome {
    pub spent: i128,
    pub received: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidPolicy = 1,
    Expired = 2,
    Replay = 3,
    UntrustedToken = 4,
    UntrustedRouter = 5,
    WrongPair = 6,
    SpendExceeded = 7,
    ReceiptTooLow = 8,
    Arithmetic = 9,
}

#[contract]
pub struct Caveat;

fn extend(e: &Env) {
    e.storage().instance().extend_ttl(100_000, 120_000);
}

#[contractimpl]
impl Caveat {
    pub fn __constructor(e: Env, owner: Address, tokens: Vec<Address>, routers: Vec<Address>) {
        owner.require_auth();
        if tokens.len() < 2 || routers.is_empty() {
            panic_with_error!(&e, Error::InvalidPolicy);
        }
        e.storage().instance().set(&Key::Owner, &owner);
        e.storage().instance().set(&Key::Tokens, &tokens);
        e.storage().instance().set(&Key::Routers, &routers);
        e.storage().instance().set(&Key::Nonce, &0u64);
        extend(&e);
    }

    pub fn owner(e: Env) -> Address {
        e.storage().instance().get(&Key::Owner).unwrap()
    }
    pub fn nonce(e: Env) -> u64 {
        e.storage().instance().get(&Key::Nonce).unwrap()
    }

    pub fn execute(e: Env, policy: Policy) -> Outcome {
        // require_auth binds the owner's authorization to EVERY argument in this invocation.
        Self::owner(e.clone()).require_auth();
        extend(&e);
        if policy.amount_in <= 0
            || policy.max_spend <= 0
            || policy.min_receive <= 0
            || policy.amount_in > policy.max_spend
            || !policy.deny_approvals
            || policy.token_in == policy.token_out
        {
            panic_with_error!(&e, Error::InvalidPolicy);
        }
        if e.ledger().timestamp() > policy.expires_at {
            panic_with_error!(&e, Error::Expired);
        }
        let nonce = Self::nonce(e.clone());
        if nonce != policy.nonce {
            panic_with_error!(&e, Error::Replay);
        }
        let tokens: Vec<Address> = e.storage().instance().get(&Key::Tokens).unwrap();
        let routers: Vec<Address> = e.storage().instance().get(&Key::Routers).unwrap();
        if !tokens.contains(&policy.token_in) || !tokens.contains(&policy.token_out) {
            panic_with_error!(&e, Error::UntrustedToken);
        }
        if !routers.contains(&policy.router) {
            panic_with_error!(&e, Error::UntrustedRouter);
        }
        let account = e.current_contract_address();
        let input = token::Client::new(&e, &policy.token_in);
        let output = token::Client::new(&e, &policy.token_out);
        let before_in = input.balance(&account);
        let before_out = output.balance(&account);
        let pair: Address = e.invoke_contract(
            &policy.router,
            &Symbol::new(&e, "router_pair_for"),
            vec![
                &e,
                policy.token_in.clone().into_val(&e),
                policy.token_out.clone().into_val(&e),
            ],
        );
        if pair != policy.pair {
            panic_with_error!(&e, Error::WrongPair);
        }

        // Only this nested transfer is permitted. No approve, burn or additional spend.
        e.authorize_as_current_contract(vec![
            &e,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: policy.token_in.clone(),
                    fn_name: symbol_short!("transfer"),
                    args: (account.clone(), pair, policy.amount_in).into_val(&e),
                },
                sub_invocations: Vec::new(&e),
            }),
        ]);
        // Soroswap directly requires recipient auth; an immediate contract invoker satisfies it.
        // Its deeper token.transfer is covered by the exact authorization above.
        let _claimed: Vec<i128> = e.invoke_contract(
            &policy.router,
            &Symbol::new(&e, "swap_exact_tokens_for_tokens"),
            (
                policy.amount_in,
                0i128,
                vec![&e, policy.token_in.clone(), policy.token_out.clone()],
                account.clone(),
                policy.expires_at,
            )
                .into_val(&e),
        );
        let spent = before_in
            .checked_sub(input.balance(&account))
            .unwrap_or_else(|| panic_with_error!(&e, Error::Arithmetic));
        let received = output
            .balance(&account)
            .checked_sub(before_out)
            .unwrap_or_else(|| panic_with_error!(&e, Error::Arithmetic));
        if spent < 0 || spent > policy.max_spend {
            panic_with_error!(&e, Error::SpendExceeded);
        }
        if received < policy.min_receive {
            panic_with_error!(&e, Error::ReceiptTooLow);
        }
        // Panic rather than return a soft failure: the host must roll back nested effects.
        let next = nonce
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&e, Error::Arithmetic));
        e.storage().instance().set(&Key::Nonce, &next);
        let outcome = Outcome { spent, received };
        e.events()
            .publish((symbol_short!("executed"), nonce), outcome.clone());
        outcome
    }

    // Explicit owner-only recovery, with no protocol or generic-call privileges.
    pub fn withdraw(e: Env, token: Address, to: Address, amount: i128) {
        Self::owner(e.clone()).require_auth();
        if amount <= 0 {
            panic_with_error!(&e, Error::InvalidPolicy);
        }
        extend(&e);
        token::Client::new(&e, &token).transfer(&e.current_contract_address(), &to, &amount);
    }
}

#[cfg(test)]
mod test;
