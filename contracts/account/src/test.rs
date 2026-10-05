use super::*;
use caveat_demo_router::{DemoRouter, DemoRouterClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    token::StellarAssetClient,
};

struct Fixture {
    e: Env,
    owner: Address,
    account: Address,
    input: Address,
    output: Address,
    router: Address,
}
impl Fixture {
    fn new(mode: u32) -> Self {
        let e = Env::default();
        e.mock_all_auths(); // Constructor / mint fixture setup only. Cleared before execute.
        e.ledger().with_mut(|l| {
            l.timestamp = 100;
            l.sequence_number = 100;
        });
        let owner = Address::generate(&e);
        let admin = Address::generate(&e);
        let input = e
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let output = e.register_stellar_asset_contract_v2(admin).address();
        let router = e.register(DemoRouter, (mode,));
        let account = e.register(
            Caveat,
            (
                owner.clone(),
                vec![&e, input.clone(), output.clone()],
                vec![&e, router.clone()],
            ),
        );
        StellarAssetClient::new(&e, &input).mint(&account, &1000);
        StellarAssetClient::new(&e, &output).mint(&router, &10_000);
        e.mock_auths(&[]); // Do not globally bypass contract authorization in attack tests.
        Self {
            e,
            owner,
            account,
            input,
            output,
            router,
        }
    }
    fn policy(&self) -> Policy {
        Policy {
            amount_in: 100,
            deny_approvals: true,
            expires_at: 200,
            max_spend: 100,
            min_receive: 190,
            nonce: 0,
            pair: self.router.clone(),
            router: self.router.clone(),
            token_in: self.input.clone(),
            token_out: self.output.clone(),
        }
    }
    fn authorize(&self, policy: &Policy) {
        self.e.mock_auths(&[MockAuth {
            address: &self.owner,
            invoke: &MockAuthInvoke {
                contract: &self.account,
                fn_name: "execute",
                args: (policy.clone(),).into_val(&self.e),
                sub_invokes: &[],
            },
        }]);
    }
    fn assert_unchanged(&self) {
        assert_eq!(
            token::Client::new(&self.e, &self.input).balance(&self.account),
            1000
        );
        assert_eq!(
            token::Client::new(&self.e, &self.input).balance(&self.router),
            0
        );
        assert_eq!(
            token::Client::new(&self.e, &self.output).balance(&self.account),
            0
        );
        assert_eq!(
            token::Client::new(&self.e, &self.output).balance(&self.router),
            10_000
        );
        assert_eq!(CaveatClient::new(&self.e, &self.account).nonce(), 0);
    }
}

#[test]
fn honest_swap_measures_balances_and_advances_nonce() {
    let f = Fixture::new(0);
    let p = f.policy();
    f.authorize(&p);
    let c = CaveatClient::new(&f.e, &f.account);
    assert_eq!(
        c.execute(&p),
        Outcome {
            spent: 100,
            received: 200
        }
    );
    assert_eq!(c.nonce(), 1);
    assert_eq!(token::Client::new(&f.e, &f.input).balance(&f.account), 900);
    assert_eq!(token::Client::new(&f.e, &f.output).balance(&f.account), 200);
    f.authorize(&p);
    assert_eq!(c.try_execute(&p), Err(Ok(Error::Replay.into())));
}

#[test]
fn false_router_receipt_rolls_back_all_transfers_and_nonce() {
    let f = Fixture::new(1);
    let p = f.policy();
    f.authorize(&p);
    assert_eq!(
        CaveatClient::new(&f.e, &f.account).try_execute(&p),
        Err(Ok(Error::ReceiptTooLow.into()))
    );
    f.assert_unchanged();
}

#[test]
fn forbidden_approval_is_not_authorized() {
    let f = Fixture::new(2);
    let p = f.policy();
    f.authorize(&p);
    assert_authorization_rejected(&f.e, || CaveatClient::new(&f.e, &f.account).try_execute(&p));
    f.assert_unchanged();
    assert_eq!(
        token::Client::new(&f.e, &f.input).allowance(&f.account, &f.router),
        0
    );
}

#[test]
fn excess_transfer_is_not_authorized() {
    let f = Fixture::new(3);
    let p = f.policy();
    f.authorize(&p);
    assert_authorization_rejected(&f.e, || CaveatClient::new(&f.e, &f.account).try_execute(&p));
    f.assert_unchanged();
}

#[test]
fn expired_intent_and_changed_pair_are_rejected() {
    let f = Fixture::new(0);
    let mut p = f.policy();
    p.expires_at = 99;
    f.authorize(&p);
    let c = CaveatClient::new(&f.e, &f.account);
    assert_eq!(c.try_execute(&p), Err(Ok(Error::Expired.into())));
    f.assert_unchanged();
    p = f.policy();
    p.pair = Address::generate(&f.e);
    f.authorize(&p);
    assert_eq!(c.try_execute(&p), Err(Ok(Error::WrongPair.into())));
    f.assert_unchanged();
}

#[test]
fn untrusted_token_and_router_and_approval_policy_are_rejected() {
    let f = Fixture::new(0);
    let c = CaveatClient::new(&f.e, &f.account);
    let mut p = f.policy();
    p.token_out = Address::generate(&f.e);
    f.authorize(&p);
    assert_eq!(c.try_execute(&p), Err(Ok(Error::UntrustedToken.into())));
    p = f.policy();
    p.router = Address::generate(&f.e);
    f.authorize(&p);
    assert_eq!(c.try_execute(&p), Err(Ok(Error::UntrustedRouter.into())));
    p = f.policy();
    p.deny_approvals = false;
    f.authorize(&p);
    assert_eq!(c.try_execute(&p), Err(Ok(Error::InvalidPolicy.into())));
    f.assert_unchanged();
}

#[test]
fn missing_owner_signature_is_rejected() {
    let f = Fixture::new(0);
    assert_authorization_rejected(&f.e, || {
        CaveatClient::new(&f.e, &f.account).try_execute(&f.policy())
    });
    f.assert_unchanged();
}

#[test]
fn fixture_implements_soroswap_pair_resolution_abi() {
    let f = Fixture::new(0);
    assert_eq!(
        DemoRouterClient::new(&f.e, &f.router).router_pair_for(&f.input, &f.output),
        f.router
    );
}

#[test]
fn changing_any_signed_policy_field_invalidates_owner_authorization() {
    let f = Fixture::new(0);
    let signed = f.policy();
    let changed = [
        Policy {
            amount_in: 99,
            ..signed.clone()
        },
        Policy {
            max_spend: 101,
            ..signed.clone()
        },
        Policy {
            min_receive: 1,
            ..signed.clone()
        },
        Policy {
            expires_at: 201,
            ..signed.clone()
        },
        Policy {
            nonce: 1,
            ..signed.clone()
        },
        Policy {
            deny_approvals: false,
            ..signed.clone()
        },
        Policy {
            pair: Address::generate(&f.e),
            ..signed.clone()
        },
        Policy {
            router: Address::generate(&f.e),
            ..signed.clone()
        },
        Policy {
            token_in: Address::generate(&f.e),
            ..signed.clone()
        },
        Policy {
            token_out: Address::generate(&f.e),
            ..signed.clone()
        },
    ];
    for submitted in changed {
        f.authorize(&signed);
        // Must abort in host authorization, before any contract policy validation.
        assert_authorization_rejected(&f.e, || {
            CaveatClient::new(&f.e, &f.account).try_execute(&submitted)
        });
        f.assert_unchanged();
    }
}

#[test]
fn nonpositive_bounds_excess_input_and_identical_tokens_are_rejected() {
    let f = Fixture::new(0);
    let invalid = [
        Policy {
            amount_in: 0,
            ..f.policy()
        },
        Policy {
            amount_in: -1,
            ..f.policy()
        },
        Policy {
            max_spend: 0,
            ..f.policy()
        },
        Policy {
            max_spend: -1,
            ..f.policy()
        },
        Policy {
            min_receive: 0,
            ..f.policy()
        },
        Policy {
            min_receive: -1,
            ..f.policy()
        },
        Policy {
            max_spend: 99,
            ..f.policy()
        },
        Policy {
            token_out: f.input.clone(),
            ..f.policy()
        },
    ];
    for policy in invalid {
        f.authorize(&policy);
        assert_eq!(
            CaveatClient::new(&f.e, &f.account).try_execute(&policy),
            Err(Ok(Error::InvalidPolicy.into())),
        );
        f.assert_unchanged();
    }
}

#[test]
fn withdrawal_requires_the_owner_and_binds_token_recipient_and_amount() {
    let f = Fixture::new(0);
    let c = CaveatClient::new(&f.e, &f.account);
    let recipient = Address::generate(&f.e);
    assert_authorization_rejected(&f.e, || c.try_withdraw(&f.input, &recipient, &100));
    f.assert_unchanged();

    let authorize = || {
        f.e.mock_auths(&[MockAuth {
            address: &f.owner,
            invoke: &MockAuthInvoke {
                contract: &f.account,
                fn_name: "withdraw",
                args: (f.input.clone(), recipient.clone(), 100i128).into_val(&f.e),
                sub_invokes: &[],
            },
        }])
    };
    authorize();
    assert_authorization_rejected(&f.e, || c.try_withdraw(&f.input, &recipient, &101));
    authorize();
    assert_authorization_rejected(&f.e, || {
        c.try_withdraw(&f.input, &Address::generate(&f.e), &100)
    });
    authorize();
    assert_authorization_rejected(&f.e, || c.try_withdraw(&f.output, &recipient, &100));
    f.assert_unchanged();

    authorize();
    c.withdraw(&f.input, &recipient, &100);
    assert_eq!(token::Client::new(&f.e, &f.input).balance(&f.account), 900);
    assert_eq!(token::Client::new(&f.e, &f.input).balance(&recipient), 100);
    assert_eq!(c.nonce(), 0);
}

#[test]
fn nonpositive_owner_authorized_withdrawal_amounts_do_not_move_funds() {
    // Withdrawal has no expiry policy; invalid amounts still require owner auth.
    let f = Fixture::new(0);
    for amount in [0i128, -1] {
        f.e.mock_auths(&[MockAuth {
            address: &f.owner,
            invoke: &MockAuthInvoke {
                contract: &f.account,
                fn_name: "withdraw",
                args: (f.input.clone(), f.owner.clone(), amount).into_val(&f.e),
                sub_invokes: &[],
            },
        }]);
        assert_eq!(
            CaveatClient::new(&f.e, &f.account).try_withdraw(&f.input, &f.owner, &amount),
            Err(Ok(Error::InvalidPolicy.into()))
        );
        f.assert_unchanged();
    }
}

// try_call intentionally narrows host errors to Context/InvalidAction. Check only
// NEW diagnostics from this invocation to prove the underlying failure was auth.
fn assert_authorization_rejected<T: core::fmt::Debug, E: core::fmt::Debug>(
    e: &Env,
    invoke: impl FnOnce() -> Result<Result<T, E>, Result<soroban_sdk::Error, soroban_sdk::InvokeError>>,
) {
    use soroban_sdk::xdr::{
        ContractEventBody, ContractEventType, ScError, ScErrorCode, ScErrorType, ScVal,
    };
    let before = e.host().get_diagnostic_events().unwrap().0.len();
    let result = invoke();
    let Err(Ok(error)) = result else {
        panic!("Expected authorization failure, got {result:?}")
    };
    assert_eq!(
        error,
        soroban_sdk::Error::from_type_and_code(ScErrorType::Context, ScErrorCode::InvalidAction)
    );
    let diagnostics = e.host().get_diagnostic_events().unwrap();
    assert!(
        diagnostics.0[before..].iter().any(|event| {
            let ContractEventBody::V0(body) = &event.event.body;
            event.event.type_ == ContractEventType::Diagnostic
                && body.topics.iter().any(|topic| {
                    matches!(
                        topic,
                        ScVal::Error(ScError::Auth(ScErrorCode::InvalidAction))
                    )
                })
        }),
        "Failure must contain a fresh Auth/InvalidAction diagnostic"
    );
}
