use super::*;
use caveat_demo_router::{DemoRouter, DemoRouterClient};
use soroban_sdk::{testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke}, token::StellarAssetClient};

struct Fixture { e: Env, owner: Address, account: Address, input: Address, output: Address, router: Address }
impl Fixture {
    fn new(mode: u32) -> Self {
        let e = Env::default();
        e.mock_all_auths(); // Constructor / mint fixture setup only. Cleared before execute.
        e.ledger().with_mut(|l| { l.timestamp = 100; l.sequence_number = 100; });
        let owner = Address::generate(&e);
        let admin = Address::generate(&e);
        let input = e.register_stellar_asset_contract_v2(admin.clone()).address();
        let output = e.register_stellar_asset_contract_v2(admin).address();
        let router = e.register(DemoRouter, (mode,));
        let account = e.register(Caveat, (owner.clone(), vec![&e, input.clone(), output.clone()], vec![&e, router.clone()]));
        StellarAssetClient::new(&e, &input).mint(&account, &1000);
        StellarAssetClient::new(&e, &output).mint(&router, &10_000);
        e.mock_auths(&[]); // Do not globally bypass contract authorization in attack tests.
        Self { e, owner, account, input, output, router }
    }
    fn policy(&self) -> Policy { Policy { amount_in: 100, deny_approvals: true, expires_at: 200,
        max_spend: 100, min_receive: 190, nonce: 0, pair: self.router.clone(), router: self.router.clone(),
        token_in: self.input.clone(), token_out: self.output.clone() } }
    fn authorize(&self, policy: &Policy) {
        self.e.mock_auths(&[MockAuth { address: &self.owner, invoke: &MockAuthInvoke {
            contract: &self.account, fn_name: "execute", args: (policy.clone(),).into_val(&self.e), sub_invokes: &[],
        }}]);
    }
    fn assert_unchanged(&self) {
        assert_eq!(token::Client::new(&self.e, &self.input).balance(&self.account), 1000);
        assert_eq!(token::Client::new(&self.e, &self.input).balance(&self.router), 0);
        assert_eq!(token::Client::new(&self.e, &self.output).balance(&self.account), 0);
        assert_eq!(token::Client::new(&self.e, &self.output).balance(&self.router), 10_000);
        assert_eq!(CaveatClient::new(&self.e, &self.account).nonce(), 0);
    }
}

#[test]
fn honest_swap_measures_balances_and_advances_nonce() {
    let f = Fixture::new(0); let p = f.policy(); f.authorize(&p);
    let c = CaveatClient::new(&f.e, &f.account);
    assert_eq!(c.execute(&p), Outcome { spent: 100, received: 200 });
    assert_eq!(c.nonce(), 1);
    assert_eq!(token::Client::new(&f.e, &f.input).balance(&f.account), 900);
    assert_eq!(token::Client::new(&f.e, &f.output).balance(&f.account), 200);
    f.authorize(&p);
    assert_eq!(c.try_execute(&p), Err(Ok(Error::Replay)));
}

#[test]
fn false_router_receipt_rolls_back_all_transfers_and_nonce() {
    let f = Fixture::new(1); let p = f.policy(); f.authorize(&p);
    assert_eq!(CaveatClient::new(&f.e, &f.account).try_execute(&p), Err(Ok(Error::ReceiptTooLow)));
    f.assert_unchanged();
}

#[test]
fn forbidden_approval_is_not_authorized() {
    let f = Fixture::new(2); let p = f.policy(); f.authorize(&p);
    assert!(CaveatClient::new(&f.e, &f.account).try_execute(&p).is_err());
    f.assert_unchanged();
    assert_eq!(token::Client::new(&f.e, &f.input).allowance(&f.account, &f.router), 0);
}

#[test]
fn excess_transfer_is_not_authorized() {
    let f = Fixture::new(3); let p = f.policy(); f.authorize(&p);
    assert!(CaveatClient::new(&f.e, &f.account).try_execute(&p).is_err());
    f.assert_unchanged();
}

#[test]
fn expired_intent_and_changed_pair_are_rejected() {
    let f = Fixture::new(0); let mut p = f.policy(); p.expires_at = 99; f.authorize(&p);
    let c = CaveatClient::new(&f.e, &f.account);
    assert_eq!(c.try_execute(&p), Err(Ok(Error::Expired))); f.assert_unchanged();
    p = f.policy(); p.pair = Address::generate(&f.e); f.authorize(&p);
    assert_eq!(c.try_execute(&p), Err(Ok(Error::WrongPair))); f.assert_unchanged();
}

#[test]
fn untrusted_token_and_router_and_approval_policy_are_rejected() {
    let f = Fixture::new(0); let c = CaveatClient::new(&f.e, &f.account);
    let mut p = f.policy(); p.token_out = Address::generate(&f.e); f.authorize(&p);
    assert_eq!(c.try_execute(&p), Err(Ok(Error::UntrustedToken)));
    p = f.policy(); p.router = Address::generate(&f.e); f.authorize(&p);
    assert_eq!(c.try_execute(&p), Err(Ok(Error::UntrustedRouter)));
    p = f.policy(); p.deny_approvals = false; f.authorize(&p);
    assert_eq!(c.try_execute(&p), Err(Ok(Error::InvalidPolicy))); f.assert_unchanged();
}

#[test]
fn missing_owner_signature_is_rejected() {
    let f = Fixture::new(0);
    assert!(CaveatClient::new(&f.e, &f.account).try_execute(&f.policy()).is_err()); f.assert_unchanged();
}

#[test]
fn fixture_implements_soroswap_pair_resolution_abi() {
    let f = Fixture::new(0);
    assert_eq!(DemoRouterClient::new(&f.e, &f.router).router_pair_for(&f.input, &f.output), f.router);
}
