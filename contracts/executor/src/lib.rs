#![no_std]

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    vec, Address, Env, IntoVal, Symbol, Vec,
};

#[contracttype]
#[derive(Clone)]
enum Key {
    Config,
    Nonce(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub router: Address,
    pub pair: Address,
    pub token_a: Address,
    pub token_b: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SwapPolicy {
    pub owner: Address,
    pub router: Address,
    pub pair: Address,
    pub token_in: Address,
    pub token_out: Address,
    pub amount_in: i128,
    pub max_spend: i128,
    pub min_receive: i128,
    pub expires_at: u64,
    pub nonce: u64,
    pub deny_approvals: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityPolicy {
    pub owner: Address,
    pub router: Address,
    pub pair: Address,
    pub token_a: Address,
    pub token_b: Address,
    pub max_a: i128,
    pub max_b: i128,
    pub min_shares: i128,
    pub expires_at: u64,
    pub nonce: u64,
    pub deny_approvals: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Outcome {
    pub spent_a: i128,
    pub spent_b: i128,
    pub received: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidPolicy = 1,
    Expired = 2,
    Replay = 3,
    WrongTokens = 4,
    WrongRoute = 5,
    SpendExceeded = 7,
    ReceiptTooLow = 8,
    Arithmetic = 9,
    Settlement = 10,
    EmptyPool = 11,
}

#[contract]
pub struct Executor;

fn delta(e: &Env, after: i128, before: i128) -> i128 {
    after
        .checked_sub(before)
        .unwrap_or_else(|| panic_with_error!(e, Error::Arithmetic))
}
fn checked_quote(e: &Env, amount: i128, reserve_in: i128, reserve_out: i128) -> i128 {
    if reserve_in <= 0 || reserve_out <= 0 {
        panic_with_error!(e, Error::EmptyPool);
    }
    amount
        .checked_mul(reserve_out)
        .and_then(|v| v.checked_div(reserve_in))
        .unwrap_or_else(|| panic_with_error!(e, Error::Arithmetic))
}
fn authorize_transfer(
    e: &Env,
    token_id: &Address,
    pair: &Address,
    amount: i128,
) -> InvokerContractAuthEntry {
    InvokerContractAuthEntry::Contract(SubContractInvocation {
        context: ContractContext {
            contract: token_id.clone(),
            fn_name: symbol_short!("transfer"),
            args: (e.current_contract_address(), pair.clone(), amount).into_val(e),
        },
        sub_invocations: Vec::new(e),
    })
}
fn validate(
    e: &Env,
    owner: &Address,
    router: &Address,
    pair: &Address,
    expiry: u64,
    nonce: u64,
    deny: bool,
) -> Config {
    owner.require_auth(); // Binds ALL fields, method and the exact wallet-funding sub-invocations.
    let now = e.ledger().timestamp();
    if expiry <= now {
        panic_with_error!(e, Error::Expired);
    }
    if !deny || expiry > now.checked_add(3600).unwrap() || owner == &e.current_contract_address() {
        panic_with_error!(e, Error::InvalidPolicy);
    }
    if Executor::nonce(e.clone(), owner.clone()) != nonce {
        panic_with_error!(e, Error::Replay);
    }
    let config = Executor::config(e.clone());
    if router != &config.router || pair != &config.pair {
        panic_with_error!(e, Error::WrongRoute);
    }
    let resolved: Address = e.invoke_contract(
        router,
        &Symbol::new(e, "router_pair_for"),
        vec![
            e,
            config.token_a.clone().into_val(e),
            config.token_b.clone().into_val(e),
        ],
    );
    if resolved != config.pair {
        panic_with_error!(e, Error::WrongRoute);
    }
    e.storage().instance().extend_ttl(100_000, 120_000);
    config
}
fn commit(e: &Env, owner: &Address, nonce: u64, action: Symbol, outcome: &Outcome) {
    let next = nonce
        .checked_add(1)
        .unwrap_or_else(|| panic_with_error!(e, Error::Arithmetic));
    let key = Key::Nonce(owner.clone());
    e.storage().persistent().set(&key, &next);
    e.storage().persistent().extend_ttl(&key, 100_000, 120_000);
    e.events().publish(
        (symbol_short!("executed"), action, owner.clone(), nonce),
        outcome.clone(),
    );
}
fn refund(e: &Env, token: &token::Client, owner: &Address, baseline: i128) {
    let guard = e.current_contract_address();
    let remainder = delta(e, token.balance(&guard), baseline);
    if remainder < 0 {
        panic_with_error!(e, Error::Settlement);
    }
    if remainder > 0 {
        token.transfer(&guard, owner, &remainder);
    }
    if token.balance(&guard) != baseline {
        panic_with_error!(e, Error::Settlement);
    }
}

#[contractimpl]
impl Executor {
    // Immutable configuration, no administrator, custody API, upgrades or arbitrary calls.
    pub fn __constructor(e: Env, config: Config) {
        if config.token_a == config.token_b
            || config.pair == config.token_a
            || config.pair == config.token_b
        {
            panic_with_error!(&e, Error::InvalidPolicy);
        }
        e.storage().instance().set(&Key::Config, &config);
        e.storage().instance().extend_ttl(100_000, 120_000);
    }
    pub fn config(e: Env) -> Config {
        e.storage().instance().get(&Key::Config).unwrap()
    }
    pub fn nonce(e: Env, owner: Address) -> u64 {
        e.storage()
            .persistent()
            .get(&Key::Nonce(owner))
            .unwrap_or(0)
    }

    pub fn swap(e: Env, policy: SwapPolicy) -> Outcome {
        let config = validate(
            &e,
            &policy.owner,
            &policy.router,
            &policy.pair,
            policy.expires_at,
            policy.nonce,
            policy.deny_approvals,
        );
        if !((policy.token_in == config.token_a && policy.token_out == config.token_b)
            || (policy.token_in == config.token_b && policy.token_out == config.token_a))
        {
            panic_with_error!(&e, Error::WrongTokens);
        }
        if policy.amount_in <= 0 || policy.max_spend < policy.amount_in || policy.min_receive <= 0 {
            panic_with_error!(&e, Error::InvalidPolicy);
        }
        let guard = e.current_contract_address();
        let input = token::Client::new(&e, &policy.token_in);
        let output = token::Client::new(&e, &policy.token_out);
        let wallet_in = input.balance(&policy.owner);
        let wallet_out = output.balance(&policy.owner);
        let guard_in = input.balance(&guard);
        let guard_out = output.balance(&guard);
        input.transfer(&policy.owner, &guard, &policy.amount_in);
        // Existing donations are never included in this owner's funding or settlement.
        if delta(&e, input.balance(&guard), guard_in) != policy.amount_in {
            panic_with_error!(&e, Error::Settlement);
        }
        e.authorize_as_current_contract(vec![
            &e,
            authorize_transfer(&e, &policy.token_in, &policy.pair, policy.amount_in),
        ]);
        let _claimed: Vec<i128> = e.invoke_contract(
            &policy.router,
            &Symbol::new(&e, "swap_exact_tokens_for_tokens"),
            (
                policy.amount_in,
                0i128,
                vec![&e, policy.token_in.clone(), policy.token_out.clone()],
                guard.clone(),
                policy.expires_at,
            )
                .into_val(&e),
        );
        let received = delta(&e, output.balance(&guard), guard_out);
        if received < policy.min_receive {
            panic_with_error!(&e, Error::ReceiptTooLow);
        }
        refund(&e, &input, &policy.owner, guard_in);
        output.transfer(&guard, &policy.owner, &received);
        let spent = delta(&e, wallet_in, input.balance(&policy.owner));
        let wallet_received = delta(&e, output.balance(&policy.owner), wallet_out);
        if spent < 0 || spent > policy.max_spend {
            panic_with_error!(&e, Error::SpendExceeded);
        }
        if wallet_received < policy.min_receive {
            panic_with_error!(&e, Error::ReceiptTooLow);
        }
        if output.balance(&guard) != guard_out {
            panic_with_error!(&e, Error::Settlement);
        }
        let outcome = Outcome {
            spent_a: spent,
            spent_b: 0,
            received: wallet_received,
        };
        commit(
            &e,
            &policy.owner,
            policy.nonce,
            symbol_short!("swap"),
            &outcome,
        );
        outcome
    }

    pub fn add_liquidity(e: Env, policy: LiquidityPolicy) -> Outcome {
        let config = validate(
            &e,
            &policy.owner,
            &policy.router,
            &policy.pair,
            policy.expires_at,
            policy.nonce,
            policy.deny_approvals,
        );
        if policy.token_a != config.token_a || policy.token_b != config.token_b {
            panic_with_error!(&e, Error::WrongTokens);
        }
        if policy.max_a <= 0 || policy.max_b <= 0 || policy.min_shares <= 0 {
            panic_with_error!(&e, Error::InvalidPolicy);
        }
        let first: Address =
            e.invoke_contract(&policy.pair, &symbol_short!("token_0"), Vec::new(&e));
        let reserves: (i128, i128) =
            e.invoke_contract(&policy.pair, &Symbol::new(&e, "get_reserves"), Vec::new(&e));
        let (reserve_a, reserve_b) = if first == config.token_a {
            reserves
        } else if first == config.token_b {
            (reserves.1, reserves.0)
        } else {
            panic_with_error!(&e, Error::WrongTokens);
        };
        let optimal_b = checked_quote(&e, policy.max_a, reserve_a, reserve_b);
        let (amount_a, amount_b) = if optimal_b <= policy.max_b {
            (policy.max_a, optimal_b)
        } else {
            (
                checked_quote(&e, policy.max_b, reserve_b, reserve_a),
                policy.max_b,
            )
        };
        if amount_a <= 0 || amount_b <= 0 {
            panic_with_error!(&e, Error::InvalidPolicy);
        }
        let guard = e.current_contract_address();
        let a = token::Client::new(&e, &policy.token_a);
        let b = token::Client::new(&e, &policy.token_b);
        let shares = token::Client::new(&e, &policy.pair);
        let wallet_a = a.balance(&policy.owner);
        let wallet_b = b.balance(&policy.owner);
        let wallet_shares = shares.balance(&policy.owner);
        let guard_a = a.balance(&guard);
        let guard_b = b.balance(&guard);
        let guard_shares = shares.balance(&guard);
        // Fund exactly the current pool ratio within the two signed maximums.
        a.transfer(&policy.owner, &guard, &amount_a);
        b.transfer(&policy.owner, &guard, &amount_b);
        if delta(&e, a.balance(&guard), guard_a) != amount_a
            || delta(&e, b.balance(&guard), guard_b) != amount_b
        {
            panic_with_error!(&e, Error::Settlement);
        }
        e.authorize_as_current_contract(vec![
            &e,
            authorize_transfer(&e, &policy.token_a, &policy.pair, amount_a),
            authorize_transfer(&e, &policy.token_b, &policy.pair, amount_b),
        ]);
        let _claimed: (i128, i128, i128) = e.invoke_contract(
            &policy.router,
            &Symbol::new(&e, "add_liquidity"),
            (
                policy.token_a.clone(),
                policy.token_b.clone(),
                policy.max_a,
                policy.max_b,
                0i128,
                0i128,
                guard.clone(),
                policy.expires_at,
            )
                .into_val(&e),
        );
        let minted = delta(&e, shares.balance(&guard), guard_shares);
        if minted < policy.min_shares {
            panic_with_error!(&e, Error::ReceiptTooLow);
        }
        refund(&e, &a, &policy.owner, guard_a);
        refund(&e, &b, &policy.owner, guard_b);
        shares.transfer(&guard, &policy.owner, &minted);
        let spent_a = delta(&e, wallet_a, a.balance(&policy.owner));
        let spent_b = delta(&e, wallet_b, b.balance(&policy.owner));
        let received = delta(&e, shares.balance(&policy.owner), wallet_shares);
        if spent_a < 0 || spent_b < 0 || spent_a > policy.max_a || spent_b > policy.max_b {
            panic_with_error!(&e, Error::SpendExceeded);
        }
        if received < policy.min_shares {
            panic_with_error!(&e, Error::ReceiptTooLow);
        }
        if shares.balance(&guard) != guard_shares {
            panic_with_error!(&e, Error::Settlement);
        }
        let outcome = Outcome {
            spent_a,
            spent_b,
            received,
        };
        commit(
            &e,
            &policy.owner,
            policy.nonce,
            symbol_short!("liquidity"),
            &outcome,
        );
        outcome
    }
}

#[cfg(test)]
mod test;
