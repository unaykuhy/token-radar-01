// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value is the comps model: a pre-token protocol is valued from what the market already pays for
// comparable, live-token protocols with a TVL on record.
//
//   categoryMultiple = median(mcap_usd / tvl_usd) over protocols in the same category, when that category
//                      has at least CATEGORY_MIN_PEERS such protocols; otherwise the global median over
//                      every protocol with a market cap and a TVL. A null category always uses the global
//                      median.
//   growthPct        = clamp(change_7d, -30, 30) per cent
//   growthMult       = 1 + growthPct / 100
//   ageYears         = age_days unknown: 0, else min(age_days / 365.25, 2)
//   ageMult          = 1 + 0.1 x ageYears
//   chainMult        = 1 + 0.05 x min(max(chains.length - 1, 0), 4)
//   implied          = max(1, round(tvl_usd x categoryMultiple x growthMult x ageMult x chainMult))
//   airdrop          = round(implied x 0.07)
//
// The constants are the comps model's, stated in the dashboard and changeable in the model sandbox. No
// protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_floor: number;
  growth_cap: number;
  age_rate: number;
  age_years_max: number;
  chain_bonus: number;
  chain_extra_max: number;
  airdrop_pct: number;
  category_min_peers: number;
}

export const MODEL: ModelConstants = {
  growth_floor: -30,
  growth_cap: 30,
  age_rate: 0.1,
  age_years_max: 2,
  chain_bonus: 0.05,
  chain_extra_max: 4,
  airdrop_pct: 0.07,
  category_min_peers: 3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'comps-1';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  airdrop_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    age_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, shipping the board's farm steps verbatim. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  airdrop_value_usd: number;
  category_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  age_multiplier: number;
  chain_multiplier: number;
  starting_capital_usd: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  watchlist: string[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of `values`, or 0 when there are none. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Every protocol's market-cap-to-TVL ratio, together with the same ratios grouped by category. */
interface Comps {
  globalMultiple: number;
  byCategory: Map<string, number[]>;
}

/** The comps ratios the snapshot supports: a market cap above zero and a TVL above zero. */
function compsOf(protocols: SnapshotProtocol[]): Comps {
  const ratios: number[] = [];
  const byCategory = new Map<string, number[]>();
  for (const q of protocols) {
    if (q.mcap_usd === null || q.mcap_usd <= 0 || q.tvl_usd <= 0) continue;
    const ratio = q.mcap_usd / q.tvl_usd;
    ratios.push(ratio);
    if (q.category !== null) {
      const peers = byCategory.get(q.category);
      if (peers === undefined) byCategory.set(q.category, [ratio]);
      else peers.push(ratio);
    }
  }
  return { globalMultiple: median(ratios), byCategory };
}

/** The market-cap-to-TVL multiple a protocol's category earns, or the global multiple when it has too few peers. */
function categoryMultiple(p: SnapshotProtocol, comps: Comps, model: ModelConstants): number {
  if (p.category === null) return comps.globalMultiple;
  const peers = comps.byCategory.get(p.category);
  if (peers === undefined || peers.length < model.category_min_peers) return comps.globalMultiple;
  return median(peers);
}

/** One protocol's comps breakdown and the values built from it. */
interface Scored {
  implied: number;
  airdrop: number;
  categoryMultiple: number;
  growthPct: number;
  growthMult: number;
  ageMult: number;
  chainMult: number;
  age: number | null;
}

/** Score one protocol under `model` against the snapshot's comps. */
function scoreProtocol(p: SnapshotProtocol, asOf: string, comps: Comps, model: ModelConstants): Scored {
  const age = ageDays(asOf, p.listed_at);
  const multiple = categoryMultiple(p, comps, model);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + growthPct / 100;
  const ageYears = age === null ? 0 : Math.min(age / 365.25, model.age_years_max);
  const ageMult = 1 + model.age_rate * ageYears;
  const chainMult = 1 + model.chain_bonus * Math.min(Math.max(p.chains.length - 1, 0), model.chain_extra_max);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * ageMult * chainMult));
  const airdrop = Math.round(implied * model.airdrop_pct);
  return { implied, airdrop, categoryMultiple: multiple, growthPct, growthMult, ageMult, chainMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const comps = compsOf(snapshot.protocols);
  const scored = [...chosen.values()].map((p) => ({ p, result: scoreProtocol(p, snapshot.as_of, comps, model) }));
  scored.sort((a, b) => b.result.implied - a.result.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.result.age,
    implied_value_usd: s.result.implied,
    airdrop_value_usd: s.result.airdrop,
    model: {
      category_multiple: s.result.categoryMultiple,
      growth_pct: s.result.growthPct,
      growth_multiplier: s.result.growthMult,
      age_multiplier: s.result.ageMult,
      chain_multiplier: s.result.chainMult,
      age_days: s.result.age,
    },
    farm_steps: farmSteps(s.p, s.result.age).map(stepText),
  }));
}



/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Gas cost tier for a chain name. Returns the typical USD cost per transaction. */
function gasCostForChain(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum' || c === 'ethereum mainnet' || c === 'mainnet') return 10;
  if (c === 'arbitrum' || c === 'optimism' || c === 'base' || c === 'ink' || c === 'plume' || c === 'monad' || c === 'linea' || c === 'scroll' || c === 'zksync' || c === 'blast' || c === 'mode' || c === 'mantle' || c === 'sonic' || c === 'unichain' || c === 'world chain' || c === 'katana' || c === 'hemi' || c === 'tac' || c === 'rayls' || c === 'robinhood chain' || c === 'plasma' || c === 'hyperliquid l1' || c === 'citrea' || c === 'etherlink' || c === 'flare' || c === 'berachain' || c === 'arc' || c === 'bsquared') return 0.5;
  if (c === 'solana' || c === 'sui' || c === 'aptos' || c === 'monad' || c === 'sei' || c === 'phantom' || c === 'hyperliquid') return 0.05;
  if (c === 'bitcoin' || c === 'lightning' || c === 'core' || c === 'babylon genesis' || c === 'stacks') return 3;
  if (c === 'algo' || c === 'algorand' || c === 'ripple' || c === 'xrp' || c === 'xrpl' || c === 'stellar' || c === 'near' || c === 'polygon' || c === 'bsc' || c === 'binance' || c === 'bnb' || c === 'avalanche' || c === 'fantom' || c === 'celo' || c === 'gnosis' || c === 'harmony' || c === 'moonbeam' || c === 'moonriver' || c === 'kava' || c === 'evmos' || c === 'osmosis' || c === 'injective' || c === 'dydx' || c === 'terra' || c === 'terra classic' || c === 'kaspa') return 0.1;
  return 1;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function startingCapitalUsd(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  return startingCapitalUsd(p.tvl_usd);
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Category-specific action #1: the core qualifying action for this protocol type. */
function categoryAction1(p: SnapshotProtocol, capital: number, chain: string, gas: number): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('curator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares for the full hold period.`;
  if (c.includes('onchain capital allocator') || c.includes('allocator')) return `Allocate $${capital} to a ${name} strategy on ${chain} and keep the allocation active.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing RWA token on ${chain} and hold it in your wallet.`;
  if (c.includes('lending')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow up to 50% LTV and keep both positions open.`;
  if (c.includes('dex') || c.includes('amm')) return `Provide $${capital} of two-sided liquidity to ${name}'s highest-volume pool on ${chain} and keep the LP position.`;
  if (c.includes('basis trading') || c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the delta-neutral position running.`;
  if (c.includes('cdp') || c.includes('collateralized debt')) return `Deposit $${capital} of ETH as collateral on ${name}, mint the stablecoin, and keep the CDP above 150% ratio.`;
  if (c.includes('bridge') && !c.includes('canonical')) return `Bridge $${capital} of USDC from Ethereum to ${chain} via ${name}, then use the funds in a ${name}-integrated app.`;
  if (c.includes('canonical bridge')) return `Deposit $${capital} of ETH into ${name} on ${chain} to mint the canonical wrapped asset and hold it.`;
  if (c.includes('staking') && !c.includes('restak') && !c.includes('pool')) return `Stake $${capital} of ${chain}'s native staking token through ${name} and keep the staking receipt.`;
  if (c.includes('restak')) return `Restake $${capital} of liquid staking tokens (stETH, rETH, or cbETH) through ${name} on ${chain} and keep the restaked position.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name}, open a 2x leveraged perpetual position, and manage it for the hold period.`;
  if (c.includes('yield') && !c.includes('rwa') && !c.includes('lending')) return `Deposit $${capital} of USDC into ${name}'s yield strategy on ${chain} and keep the yield-bearing shares.`;
  if (c.includes('prediction') || c.includes('market')) return `Fund $${capital} of USDC on ${name}, place one market position on a resolved market, and keep the position until resolution.`;
  if (c.includes('insurance')) return `Buy $${capital} of smart-contract cover from ${name} on ${chain} for a 90-day term and keep the policy active.`;
  if (c.includes('payment')) return `Send $${capital} of USDC through ${name}'s payment rail on ${chain} to a fresh address and confirm settlement.`;
  if (c.includes('chain') && !c.includes('canonical')) return `Bridge $${capital} of USDC to ${name} (${chain}), pay one week of gas fees from the wallet, and keep the balance.`;
  if (c.includes('stablecoin wrapper') || c.includes('stable wrapper')) return `Mint $${capital} of ${name}'s wrapped stablecoin on ${chain} and hold it through at least one rebase or fee cycle.`;
  if (c.includes('collateral market') || c.includes('collateral')) return `Deposit $${capital} of ETH as collateral on ${name}, borrow the protocol's stablecoin, and keep the position above liquidation threshold.`;
  if (c.includes('cedefi') || c.includes('cefi')) return `Deposit $${capital} of USDC into ${name}'s CeDeFi vault on ${chain} and keep the position for the full hold period.`;
  if (c.includes('governance incentive') || c.includes('governance')) return `Delegate $${capital} worth of governance tokens to ${name}'s incentive program on ${chain} and vote on one active proposal.`;
  if (c.includes('staking pool') && !c.includes('restak')) return `Deposit $${capital} of the pool asset into ${name}'s staking pool on ${chain} and keep the pool shares.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open for the full hold period.`;
}

/** Category-specific action #2: a weekly or periodic action unique to this protocol type. */
function categoryAction2(p: SnapshotProtocol, capital: number, chain: string, gas: number): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('curator')) return `Once per week, check ${name}'s vault performance dashboard and rebalance if the strategy allocation shifted >10%.`;
  if (c.includes('onchain capital allocator') || c.includes('allocator')) return `Once per week, review ${name}'s strategy weights on ${chain} and confirm your allocation matches the current target.`;
  if (c.includes('rwa')) return `Once per week, verify ${name}'s reserve attestation on ${chain} and confirm your yield tokens still accrue interest.`;
  if (c.includes('lending')) return `Once per week, check your borrow health factor on ${name} and repay or add collateral if it drops below 1.5x.`;
  if (c.includes('dex') || c.includes('amm')) return `Once per week, harvest fees from ${name}'s LP position on ${chain} and compound them back into the pool.`;
  if (c.includes('basis trading') || c.includes('basis')) return `Once per week, confirm ${name}'s funding rate capture on ${chain} is positive and the delta hedge is balanced.`;
  if (c.includes('cdp') || c.includes('collateralized debt')) return `Once per week, check your CDP collateral ratio on ${name} and top up if it falls below 180%.`;
  if (c.includes('bridge') && !c.includes('canonical')) return `Once per week, bridge $${Math.max(10, Math.floor(capital * 0.1))} of volume through ${name} on ${chain} to maintain active user status.`;
  if (c.includes('canonical bridge')) return `Once per week, wrap or unwrap $${Math.max(10, Math.floor(capital * 0.1))} through ${name} on ${chain} to generate canonical bridge volume.`;
  if (c.includes('staking') && !c.includes('restak') && !c.includes('pool')) return `Once per week, claim staking rewards from ${name} on ${chain} and restake them to compound the yield.`;
  if (c.includes('restak')) return `Once per week, check ${name}'s restaking rewards on ${chain}, claim any available, and verify slash protection is active.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Once per week, adjust your ${name} perpetual position on ${chain} to maintain 2x leverage and pay funding if negative.`;
  if (c.includes('yield') && !c.includes('rwa') && !c.includes('lending')) return `Once per week, claim and compound ${name}'s yield rewards on ${chain} into the same strategy.`;
  if (c.includes('prediction') || c.includes('market')) return `Once per week, place one new market position on ${name} with at least $${Math.max(10, Math.floor(capital * 0.1))} and hold to resolution.`;
  if (c.includes('insurance')) return `Once per week, confirm ${name}'s cover policy on ${chain} is active and the protocol's solvency metrics are healthy.`;
  if (c.includes('payment')) return `Once per week, send one $${Math.max(10, Math.floor(capital * 0.1))} payment through ${name} on ${chain} and verify on-chain settlement.`;
  if (c.includes('chain') && !c.includes('canonical')) return `Once per week, execute at least 3 transactions on ${name} (${chain}) to maintain active wallet status.`;
  if (c.includes('stablecoin wrapper') || c.includes('stable wrapper')) return `Once per week, check ${name}'s peg stability on ${chain} and redeem or mint $${Math.max(10, Math.floor(capital * 0.1))} if arb exists.`;
  if (c.includes('collateral market') || c.includes('collateral')) return `Once per week, monitor ${name}'s collateral utilization on ${chain} and adjust your borrow if utilization exceeds 80%.`;
  if (c.includes('cedefi') || c.includes('cefi')) return `Once per week, verify ${name}'s CeDeFi yield source on ${chain} is reporting and withdraw/rotate if APY drops >50%.`;
  if (c.includes('governance incentive') || c.includes('governance')) return `Once per week, vote on any active ${name} governance proposal on ${chain} with your delegated tokens.`;
  if (c.includes('staking pool') && !c.includes('restak')) return `Once per week, claim ${name}'s pool rewards on ${chain} and stake them back into the same pool.`;
  return `Once per week, make one qualifying transaction on ${name} (${chain}) such as a deposit, swap, or vote to maintain activity.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gasPerTx = gasCostForChain(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeklyGas = Math.max(0.1, gasPerTx * 1.5);
  const action1 = categoryAction1(p, capital, chain, gasPerTx);
  const action2 = categoryAction2(p, capital, chain, gasPerTx);
  const gasSetup = gasPerTx * 2;
  const gasWeekly = weeklyGas;
  const gasClaim = gasPerTx;
  return [
    {
      text: `Create a fresh wallet used only for this farm, fund it with $${capital + Math.ceil(gasSetup + gasWeekly * 4 + gasClaim)} total (${capital} capital + estimated gas), and store the seed phrase offline.`,
      cost: `$${Math.ceil(gasSetup)} gas for setup (${chain} ~\$${gasPerTx}/tx)`,
      time: '10 minutes',
    },
    {
      text: action1,
      cost: `$${capital} capital + $${Math.ceil(gasSetup)} gas for ${chain} transactions`,
      time: '20 minutes to set up and confirm',
    },
    {
      text: action2,
      cost: `$${Math.ceil(gasWeekly)} gas per week on ${chain} (~\$${gasPerTx}/tx)`,
      time: `15 minutes per week for ${hold} days`,
    },
    {
      text: `Hold the position for at least ${hold} days so the activity spans ${Math.ceil(hold / 7)} weekly snapshots and qualifies for multi-epoch rewards.`,
      cost: `$${capital} capital locked + $${Math.ceil(gasWeekly * (hold / 7))} total weekly gas`,
      time: `${hold} days (${Math.ceil(hold / 7)} weekly check-ins)`,
    },
    {
      text: `Before exiting, open ${p.name}'s official points/rewards page (verify the domain), connect your farm wallet, and claim all available rewards only from the published link.`,
      cost: `$${Math.ceil(gasClaim)} gas to claim on ${chain} (~\$${gasPerTx}/tx), zero protocol fee`,
      time: '15 minutes to verify and claim',
    },
    {
      text: `Record in your farm log: wallet address, ${chain} chain, ${p.name} (${p.category ?? 'unknown'}), $${capital} capital, start date, weekly action dates, claim tx hash, and final exit tx hash for full audit trail.`,
      cost: 'no on-chain cost',
      time: '5 minutes to log, 2 minutes per weekly update',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, shipping the board's farm steps verbatim. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    airdrop_value_usd: row.airdrop_value_usd,
    category_multiple: row.model.category_multiple,
    growth_pct: row.model.growth_pct,
    growth_multiplier: row.model.growth_multiplier,
    age_multiplier: row.model.age_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    starting_capital_usd: startingCapitalUsd(row.tvl_usd),
    farm_steps: row.farm_steps.slice(),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    watchlist: snapshot.watchlist.slice(),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
