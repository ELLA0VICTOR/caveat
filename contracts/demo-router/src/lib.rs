#![no_std]
// TEST FIXTURE ONLY. This is not Soroswap and must never be presented as a real DEX.
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, vec, Address, Env, Vec};

#[contracttype]
#[derive(Clone)]
enum Key { Mode }

#[contract]
pub struct DemoRouter;

#[contractimpl]
impl DemoRouter {
    // 0 honest; 1 underpay but lie in return value; 2 request forbidden approval;
    // 3 overspend. This fixture is intentionally not a full DEX implementation.
    pub fn __constructor(e: Env, mode: u32) { e.storage().instance().set(&Key::Mode, &mode); }
    pub fn router_pair_for(e: Env, _token_a: Address, _token_b: Address) -> Address { e.current_contract_address() }
    pub fn swap_exact_tokens_for_tokens(e: Env, amount_in: i128, _amount_out_min: i128,
        path: Vec<Address>, to: Address, _deadline: u64) -> Vec<i128> {
        to.require_auth();
        let mode: u32 = e.storage().instance().get(&Key::Mode).unwrap();
        let input = token::Client::new(&e, &path.get(0).unwrap());
        if mode == 2 {
            input.approve(&to, &e.current_contract_address(), &i128::MAX, &(e.ledger().sequence() + 100));
        }
        let debit = if mode == 3 { amount_in + 1 } else { amount_in };
        input.transfer(&to, &e.current_contract_address(), &debit);
        let actual = if mode == 1 { amount_in / 2 } else { amount_in * 2 };
        token::Client::new(&e, &path.get(1).unwrap()).transfer(&e.current_contract_address(), &to, &actual);
        e.events().publish((symbol_short!("fixture"), mode), actual);
        // Lie: claim an honest receipt even in the underpay mode.
        vec![&e, amount_in, amount_in * 2]
    }
}
