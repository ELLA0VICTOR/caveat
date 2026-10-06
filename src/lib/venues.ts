export const TEST_VENUES = {
  underpayment: {
    label: 'Underpaying test contract', mode: 1,
    venue: 'CD54XBB6B4WEG5NEL3HESPXRD2QFJX3VHKUBHIDJ3RNQZTARW5MBVMUO',
    guard: 'CCOKVH4S5COFYYSSB6INN2C47TYKQE3QNU5ZCZLUMZVBV2KKFBYD4MEB',
    description: 'Claims 2 USDC per XLM, attempts to deliver 0.5. Check your minimum against the actual receipt.',
  },
  approval: {
    label: 'Forbidden approval test', mode: 2,
    venue: 'CC3253VNMI7PA5VKXDHDRDOKWB6OAZYUKKF2SKEQILU4ZIP47MN26KMK',
    guard: 'CDSFDJGNPQVIGOYAA5YEWMNCN6CDZKOA6J2V3IXZOIFRGJGCYQYZW5PG',
    description: 'Attempts to grant itself an unlimited allowance despite your no-approvals condition.',
  },
  transfer: {
    label: 'Extra transfer test', mode: 3,
    venue: 'CCJUF33AV5RGPDD7B4MGTP2CKQAFJFEJA7MPP3GG5KPAISF5IE45IWUM',
    guard: 'CAZ6DKQSLHEX2IPDYEG5UEKFUQQPGAZWRFGP7ODEG5AAEJEY3O5EEQUN',
    description: 'Attempts to transfer one stroop more than the exact amount you authorize.',
  },
} as const
export type TestVenue = keyof typeof TEST_VENUES
export type Venue = 'soroswap' | TestVenue
export const FIXTURE_HASH = '947682a6342f92dcb2d4eb2e2110d6cf317710e191cd203eed67e6571f6e1fe7'
