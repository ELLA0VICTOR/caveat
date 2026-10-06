use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    token::StellarAssetClient,
};

// An adversarial venue, not a real DEX. Underlying balances use genuine SACs;
// shares use stateful token balances. No blanket authorization during execution.
#[contract]
struct Venue;
#[contracttype]
#[derive(Clone)]
enum VenueKey {
    A,
    B,
    Mode,
    Shares(Address),
}
#[contractimpl]
impl Venue {
    pub fn __constructor(e: Env, a: Address, b: Address, mode: u32) {
        e.storage().instance().set(&VenueKey::A, &a);
        e.storage().instance().set(&VenueKey::B, &b);
        e.storage().instance().set(&VenueKey::Mode, &mode);
    }
    pub fn token_0(e: Env) -> Address {
        e.storage().instance().get(&VenueKey::A).unwrap()
    }
    pub fn get_reserves(_e: Env) -> (i128, i128) {
        (10_000, 20_000)
    }
    pub fn router_pair_for(e: Env, _a: Address, _b: Address) -> Address {
        e.current_contract_address()
    }
    pub fn balance(e: Env, owner: Address) -> i128 {
        e.storage()
            .instance()
            .get(&VenueKey::Shares(owner))
            .unwrap_or(0)
    }
    pub fn transfer(e: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let before = Self::balance(e.clone(), from.clone());
        assert!(amount > 0 && before >= amount);
        let after = Self::balance(e.clone(), to.clone()) + amount;
        e.storage()
            .instance()
            .set(&VenueKey::Shares(from), &(before - amount));
        e.storage().instance().set(&VenueKey::Shares(to), &after);
    }
    pub fn swap_exact_tokens_for_tokens(
        e: Env,
        amount: i128,
        _min: i128,
        path: Vec<Address>,
        to: Address,
        _deadline: u64,
    ) -> Vec<i128> {
        to.require_auth();
        let mode: u32 = e.storage().instance().get(&VenueKey::Mode).unwrap();
        let input_id = path.get(0).unwrap();
        let input = token::Client::new(&e, &input_id);
        if mode == 2 {
            input.approve(&to, &e.current_contract_address(), &i128::MAX, &10_000);
        }
        input.transfer(
            &to,
            &e.current_contract_address(),
            &(amount + if mode == 3 { 1 } else { 0 }),
        );
        let output_id = path.get(1).unwrap();
        token::Client::new(&e, &output_id).transfer(
            &e.current_contract_address(),
            &to,
            &if mode == 1 { 50 } else { 200 },
        );
        vec![&e, amount, 200] // Mode 1 lies about the actual receipt.
    }
    pub fn add_liquidity(
        e: Env,
        a: Address,
        b: Address,
        max_a: i128,
        max_b: i128,
        _min_a: i128,
        _min_b: i128,
        to: Address,
        _deadline: u64,
    ) -> (i128, i128, i128) {
        to.require_auth();
        let mode: u32 = e.storage().instance().get(&VenueKey::Mode).unwrap();
        let (ra, rb) = if a == Self::token_0(e.clone()) {
            (10_000, 20_000)
        } else {
            (20_000, 10_000)
        };
        let (aa, bb) = if max_a * rb / ra <= max_b {
            (max_a, max_a * rb / ra)
        } else {
            (max_b * ra / rb, max_b)
        };
        if mode == 2 {
            token::Client::new(&e, &a).approve(
                &to,
                &e.current_contract_address(),
                &i128::MAX,
                &10_000,
            );
        }
        token::Client::new(&e, &a).transfer(
            &to,
            &e.current_contract_address(),
            &(aa + if mode == 3 { 1 } else { 0 }),
        );
        token::Client::new(&e, &b).transfer(&to, &e.current_contract_address(), &bb);
        let minted = if mode == 1 { 50 } else { 100 };
        let balance = Self::balance(e.clone(), to.clone());
        e.storage()
            .instance()
            .set(&VenueKey::Shares(to), &(balance + minted));
        (aa, bb, 100)
    }
}

struct Fixture {
    e: Env,
    owner: Address,
    guard: Address,
    a: Address,
    b: Address,
    venue: Address,
}
impl Fixture {
    fn new(mode: u32) -> Self {
        let e = Env::default();
        e.mock_all_auths(); // Fixture creation and minting only.
        e.ledger().with_mut(|l| {
            l.timestamp = 100;
            l.sequence_number = 100;
        });
        let owner = Address::generate(&e);
        let admin = Address::generate(&e);
        let a = e
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let b = e.register_stellar_asset_contract_v2(admin).address();
        let venue = e.register(Venue, (a.clone(), b.clone(), mode));
        let guard = e.register(
            Executor,
            (Config {
                router: venue.clone(),
                pair: venue.clone(),
                token_a: a.clone(),
                token_b: b.clone(),
            },),
        );
        for id in [&a, &b] {
            StellarAssetClient::new(&e, id).mint(&owner, &1000);
            StellarAssetClient::new(&e, id).mint(&venue, &30_000);
            StellarAssetClient::new(&e, id).mint(&guard, &7); // Donations must remain untouched.
        }
        e.mock_auths(&[]);
        Self {
            e,
            owner,
            guard,
            a,
            b,
            venue,
        }
    }
    fn swap(&self) -> SwapPolicy {
        SwapPolicy {
            owner: self.owner.clone(),
            router: self.venue.clone(),
            pair: self.venue.clone(),
            token_in: self.a.clone(),
            token_out: self.b.clone(),
            amount_in: 100,
            max_spend: 100,
            min_receive: 190,
            expires_at: 200,
            nonce: 0,
            deny_approvals: true,
        }
    }
    fn liquidity(&self) -> LiquidityPolicy {
        LiquidityPolicy {
            owner: self.owner.clone(),
            router: self.venue.clone(),
            pair: self.venue.clone(),
            token_a: self.a.clone(),
            token_b: self.b.clone(),
            max_a: 100,
            max_b: 250,
            min_shares: 90,
            expires_at: 200,
            nonce: 0,
            deny_approvals: true,
        }
    }
    fn authorize_swap(&self, p: &SwapPolicy) {
        self.e.mock_auths(&[MockAuth {
            address: &p.owner,
            invoke: &MockAuthInvoke {
                contract: &self.guard,
                fn_name: "swap",
                args: (p.clone(),).into_val(&self.e),
                sub_invokes: &[MockAuthInvoke {
                    contract: &p.token_in,
                    fn_name: "transfer",
                    args: (p.owner.clone(), self.guard.clone(), p.amount_in).into_val(&self.e),
                    sub_invokes: &[],
                }],
            },
        }]);
    }
    fn authorize_liquidity(&self, p: &LiquidityPolicy, aa: i128, bb: i128) {
        self.e.mock_auths(&[MockAuth {
            address: &p.owner,
            invoke: &MockAuthInvoke {
                contract: &self.guard,
                fn_name: "add_liquidity",
                args: (p.clone(),).into_val(&self.e),
                sub_invokes: &[
                    MockAuthInvoke {
                        contract: &p.token_a,
                        fn_name: "transfer",
                        args: (p.owner.clone(), self.guard.clone(), aa).into_val(&self.e),
                        sub_invokes: &[],
                    },
                    MockAuthInvoke {
                        contract: &p.token_b,
                        fn_name: "transfer",
                        args: (p.owner.clone(), self.guard.clone(), bb).into_val(&self.e),
                        sub_invokes: &[],
                    },
                ],
            },
        }]);
    }
    fn unchanged(&self) {
        for id in [&self.a, &self.b] {
            let c = token::Client::new(&self.e, id);
            assert_eq!(c.balance(&self.owner), 1000);
            assert_eq!(c.balance(&self.guard), 7);
            assert_eq!(c.balance(&self.venue), 30_000);
            assert_eq!(c.allowance(&self.guard, &self.venue), 0);
        }
        assert_eq!(
            VenueClient::new(&self.e, &self.venue).balance(&self.owner),
            0
        );
        assert_eq!(
            VenueClient::new(&self.e, &self.venue).balance(&self.guard),
            0
        );
        assert_eq!(
            ExecutorClient::new(&self.e, &self.guard).nonce(&self.owner),
            0
        );
    }
}

#[test]
fn wallet_funded_swap_returns_output_and_preserves_donations() {
    let f = Fixture::new(0);
    let p = f.swap();
    f.authorize_swap(&p);
    let c = ExecutorClient::new(&f.e, &f.guard);
    assert_eq!(
        c.swap(&p),
        Outcome {
            spent_a: 100,
            spent_b: 0,
            received: 200
        }
    );
    assert_eq!(token::Client::new(&f.e, &f.a).balance(&f.owner), 900);
    assert_eq!(token::Client::new(&f.e, &f.b).balance(&f.owner), 1200);
    for id in [&f.a, &f.b] {
        assert_eq!(token::Client::new(&f.e, id).balance(&f.guard), 7);
    }
    assert_eq!(c.nonce(&f.owner), 1);
    assert_eq!(c.nonce(&Address::generate(&f.e)), 0);
    f.authorize_swap(&p);
    assert_eq!(c.try_swap(&p), Err(Ok(Error::Replay.into())));
}

#[test]
fn liquidity_returns_actual_shares_and_uses_only_pool_ratio() {
    let f = Fixture::new(0);
    let p = f.liquidity();
    f.authorize_liquidity(&p, 100, 200);
    assert_eq!(
        ExecutorClient::new(&f.e, &f.guard).add_liquidity(&p),
        Outcome {
            spent_a: 100,
            spent_b: 200,
            received: 100
        }
    );
    assert_eq!(token::Client::new(&f.e, &f.a).balance(&f.owner), 900);
    assert_eq!(token::Client::new(&f.e, &f.b).balance(&f.owner), 800);
    assert_eq!(VenueClient::new(&f.e, &f.venue).balance(&f.owner), 100);
    assert_eq!(VenueClient::new(&f.e, &f.venue).balance(&f.guard), 0);
    for id in [&f.a, &f.b] {
        assert_eq!(token::Client::new(&f.e, id).balance(&f.guard), 7);
    }
}

#[test]
fn second_cap_and_reversed_reserves_are_respected() {
    for reversed in [false, true] {
        let f = Fixture::new(0);
        let mut p = f.liquidity();
        if reversed {
            core::mem::swap(&mut p.token_a, &mut p.token_b);
            f.e.as_contract(&f.guard, || {
                f.e.storage().instance().set(
                    &Key::Config,
                    &Config {
                        router: f.venue.clone(),
                        pair: f.venue.clone(),
                        token_a: p.token_a.clone(),
                        token_b: p.token_b.clone(),
                    },
                );
            });
        }
        p.max_b = 50;
        let aa = if reversed { 100 } else { 25 };
        f.authorize_liquidity(&p, aa, 50);
        assert_eq!(
            ExecutorClient::new(&f.e, &f.guard).add_liquidity(&p),
            Outcome {
                spent_a: aa,
                spent_b: 50,
                received: 100
            }
        );
    }
}

#[test]
fn dishonest_receipts_roll_back_both_actions() {
    let f = Fixture::new(1);
    let p = f.swap();
    f.authorize_swap(&p);
    assert_eq!(
        ExecutorClient::new(&f.e, &f.guard).try_swap(&p),
        Err(Ok(Error::ReceiptTooLow.into()))
    );
    f.unchanged();
    let p = f.liquidity();
    f.authorize_liquidity(&p, 100, 200);
    assert_eq!(
        ExecutorClient::new(&f.e, &f.guard).try_add_liquidity(&p),
        Err(Ok(Error::ReceiptTooLow.into()))
    );
    f.unchanged();
}

#[test]
fn approvals_and_extra_transfers_are_rejected_for_both_actions() {
    for mode in [2, 3] {
        let f = Fixture::new(mode);
        let p = f.swap();
        f.authorize_swap(&p);
        auth_rejected(&f.e, || ExecutorClient::new(&f.e, &f.guard).try_swap(&p));
        f.unchanged();
        let p = f.liquidity();
        f.authorize_liquidity(&p, 100, 200);
        auth_rejected(&f.e, || {
            ExecutorClient::new(&f.e, &f.guard).try_add_liquidity(&p)
        });
        f.unchanged();
    }
}

#[test]
fn missing_signature_or_missing_funding_authorization_moves_nothing() {
    let f = Fixture::new(0);
    let p = f.swap();
    auth_rejected(&f.e, || ExecutorClient::new(&f.e, &f.guard).try_swap(&p));
    f.unchanged();
    f.e.mock_auths(&[MockAuth {
        address: &f.owner,
        invoke: &MockAuthInvoke {
            contract: &f.guard,
            fn_name: "swap",
            args: (p.clone(),).into_val(&f.e),
            sub_invokes: &[],
        },
    }]);
    auth_rejected(&f.e, || ExecutorClient::new(&f.e, &f.guard).try_swap(&p));
    f.unchanged();
}

#[test]
fn every_swap_field_is_bound_to_the_owner_signature() {
    let f = Fixture::new(0);
    let signed = f.swap();
    let changed = [
        SwapPolicy {
            owner: Address::generate(&f.e),
            ..signed.clone()
        },
        SwapPolicy {
            router: Address::generate(&f.e),
            ..signed.clone()
        },
        SwapPolicy {
            pair: Address::generate(&f.e),
            ..signed.clone()
        },
        SwapPolicy {
            token_in: f.b.clone(),
            ..signed.clone()
        },
        SwapPolicy {
            token_out: f.a.clone(),
            ..signed.clone()
        },
        SwapPolicy {
            amount_in: 99,
            ..signed.clone()
        },
        SwapPolicy {
            max_spend: 101,
            ..signed.clone()
        },
        SwapPolicy {
            min_receive: 1,
            ..signed.clone()
        },
        SwapPolicy {
            expires_at: 201,
            ..signed.clone()
        },
        SwapPolicy {
            nonce: 1,
            ..signed.clone()
        },
        SwapPolicy {
            deny_approvals: false,
            ..signed.clone()
        },
    ];
    for p in changed {
        f.authorize_swap(&signed);
        auth_rejected(&f.e, || ExecutorClient::new(&f.e, &f.guard).try_swap(&p));
        f.unchanged();
    }
}

#[test]
fn every_liquidity_field_is_bound_to_the_owner_signature() {
    let f = Fixture::new(0);
    let signed = f.liquidity();
    let changed = [
        LiquidityPolicy {
            owner: Address::generate(&f.e),
            ..signed.clone()
        },
        LiquidityPolicy {
            router: Address::generate(&f.e),
            ..signed.clone()
        },
        LiquidityPolicy {
            pair: Address::generate(&f.e),
            ..signed.clone()
        },
        LiquidityPolicy {
            token_a: f.b.clone(),
            ..signed.clone()
        },
        LiquidityPolicy {
            token_b: f.a.clone(),
            ..signed.clone()
        },
        LiquidityPolicy {
            max_a: 99,
            ..signed.clone()
        },
        LiquidityPolicy {
            max_b: 251,
            ..signed.clone()
        },
        LiquidityPolicy {
            min_shares: 1,
            ..signed.clone()
        },
        LiquidityPolicy {
            expires_at: 201,
            ..signed.clone()
        },
        LiquidityPolicy {
            nonce: 1,
            ..signed.clone()
        },
        LiquidityPolicy {
            deny_approvals: false,
            ..signed.clone()
        },
    ];
    for p in changed {
        f.authorize_liquidity(&signed, 100, 200);
        auth_rejected(&f.e, || {
            ExecutorClient::new(&f.e, &f.guard).try_add_liquidity(&p)
        });
        f.unchanged();
    }
}

#[test]
fn invalid_policies_expiry_and_routes_move_nothing() {
    let f = Fixture::new(0);
    let cases = [
        (
            SwapPolicy {
                amount_in: 0,
                ..f.swap()
            },
            Error::InvalidPolicy,
        ),
        (
            SwapPolicy {
                max_spend: 99,
                ..f.swap()
            },
            Error::InvalidPolicy,
        ),
        (
            SwapPolicy {
                min_receive: 0,
                ..f.swap()
            },
            Error::InvalidPolicy,
        ),
        (
            SwapPolicy {
                expires_at: 100,
                ..f.swap()
            },
            Error::Expired,
        ),
        (
            SwapPolicy {
                expires_at: 3701,
                ..f.swap()
            },
            Error::InvalidPolicy,
        ),
        (
            SwapPolicy {
                pair: Address::generate(&f.e),
                ..f.swap()
            },
            Error::WrongRoute,
        ),
        (
            SwapPolicy {
                token_out: f.a.clone(),
                ..f.swap()
            },
            Error::WrongTokens,
        ),
        (
            SwapPolicy {
                deny_approvals: false,
                ..f.swap()
            },
            Error::InvalidPolicy,
        ),
    ];
    for (p, error) in cases {
        f.authorize_swap(&p);
        assert_eq!(
            ExecutorClient::new(&f.e, &f.guard).try_swap(&p),
            Err(Ok(error.into()))
        );
        f.unchanged();
    }
    for p in [
        LiquidityPolicy {
            max_a: 0,
            ..f.liquidity()
        },
        LiquidityPolicy {
            max_b: -1,
            ..f.liquidity()
        },
        LiquidityPolicy {
            min_shares: 0,
            ..f.liquidity()
        },
    ] {
        f.authorize_liquidity(&p, 100, 200);
        assert_eq!(
            ExecutorClient::new(&f.e, &f.guard).try_add_liquidity(&p),
            Err(Ok(Error::InvalidPolicy.into()))
        );
        f.unchanged();
    }
}

fn auth_rejected<T: core::fmt::Debug, E: core::fmt::Debug>(
    e: &Env,
    invoke: impl FnOnce() -> Result<Result<T, E>, Result<soroban_sdk::Error, soroban_sdk::InvokeError>>,
) {
    use soroban_sdk::xdr::{ContractEventBody, ScError, ScErrorCode, ScVal};
    let before = e.host().get_diagnostic_events().unwrap().0.len();
    assert!(invoke().is_err());
    let events = e.host().get_diagnostic_events().unwrap();
    assert!(
        events.0[before..].iter().any(|event| {
            let ContractEventBody::V0(body) = &event.event.body;
            body.topics
                .iter()
                .any(|v| matches!(v, ScVal::Error(ScError::Auth(ScErrorCode::InvalidAction))))
        }),
        "Expected a fresh authorization diagnostic"
    );
}
