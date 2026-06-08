// ─────────────────────────────────────────────────────────────────────────────
//  trust.js  –  fully decoded / deobfuscated
//  Original was obfuscated with a string-array shuffle + hex-index lookup.
//  All a0_0x4a9289() calls have been inlined and renamed to plain identifiers.
// ─────────────────────────────────────────────────────────────────────────────

// ── Mobile / device guard ────────────────────────────────────────────────────
// Runs immediately: if the page has a <meta name="dev-mode"> tag, skip the check.
// Otherwise redirect to "/" if the visitor is NOT on a narrow touch device.
(function () {
  if (document.querySelector('meta[name="dev-mode"]')) return;
  const isTouchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const isNarrowScreen = window.innerWidth <= 820;
  if (!isTouchDevice || !isNarrowScreen) {
    document.body.innerHTML = '';
    window.location.href = '/';
  }
})();

// ── Constants ─────────────────────────────────────────────────────────────────

const COINGECKO_IDS = {
  sol:  'solana',
  btc:  'bitcoin',
  eth:  'ethereum',
  trx:  'tron',
  bnb:  'binancecoin',
  usdt: 'tether',
};

const CURRENCIES = {
  usd: { symbol: '$',    name: 'USD' },
  eur: { symbol: '€',    name: 'EUR' },
  gbp: { symbol: '£',    name: 'GBP' },
  cad: { symbol: 'CA$',  name: 'CAD' },
  aud: { symbol: 'A$',   name: 'AUD' },
  jpy: { symbol: '¥',    name: 'JPY' },
  chf: { symbol: 'CHF',  name: 'CHF' },
  cny: { symbol: '¥',    name: 'CNY' },
  inr: { symbol: '₹',    name: 'INR' },
  brl: { symbol: 'R$',   name: 'BRL' },
  sek: { symbol: 'kr',   name: 'SEK' },
  nok: { symbol: 'kr',   name: 'NOK' },
  nzd: { symbol: 'NZ$',  name: 'NZD' },
  sgd: { symbol: 'S$',   name: 'SGD' },
  hkd: { symbol: 'HK$',  name: 'HKD' },
  krw: { symbol: '₩',    name: 'KRW' },
  try: { symbol: '₺',    name: 'TRY' },
  mxn: { symbol: 'MX$',  name: 'MXN' },
  dkk: { symbol: 'kr',   name: 'DKK' },
  czk: { symbol: 'Kč',   name: 'CZK' },
};

const COIN_NAMES = {
  sol:  'Solana',
  btc:  'Bitcoin',
  eth:  'Ethereum',
  trx:  'Tron',
  bnb:  'BNB Smart Chain',
  usdt: 'Tether USD',
};

const COIN_SYMBOLS = {
  sol:  'SOL',
  btc:  'BTC',
  eth:  'ETH',
  trx:  'TRX',
  bnb:  'BNB',
  usdt: 'USDT',
};

const COIN_ICONS = {
  sol:  'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/solana/info/logo.png',
  btc:  'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/bitcoin/info/logo.png',
  eth:  'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/ethereum/info/logo.png',
  trx:  'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/tron/info/logo.png',
  bnb:  'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/smartchain/info/logo.png',
  usdt: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0x55d398326f99059fF775485246999027B3197955/logo.png',
};

const COIN_NETWORKS = {
  sol:  'Solana',
  btc:  'Bitcoin',
  eth:  'Ethereum',
  trx:  'Tron',
  bnb:  'BNB Smart Chain',
  usdt: null,          // USDT network is set by the user (trc20 / erc20 / bep20 / spl)
};

const USDT_NETWORKS = {
  trc20: { label: 'Tron',          badge: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/tron/info/logo.png' },
  erc20: { label: 'Ethereum',      badge: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/ethereum/info/logo.png' },
  bep20: { label: 'BNB Smart Chain', badge: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/smartchain/info/logo.png' },
  spl:   { label: 'Solana',        badge: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/solana/info/logo.png' },
};

// Price cache lifetime: 5 minutes (5 * 60 * 1000 ms)
const PRICE_CACHE_MS = 5 * 60 * 1000;

// ── Settings helpers ──────────────────────────────────────────────────────────

/** Return default settings object. */
function defaults() {
  return {
    cgApiKey:    '',
    cgApiKeyPro: false,
    currency:    'usd',
    coins: {
      sol:  0,
      btc:  0,
      eth:  0,
      trx:  0,
      bnb:  0,
      usdt: 0,
    },
    usdtNetwork: 'trc20',
    walletName:  'Ascend2k',
  };
}

/** Load settings from localStorage, filling in any missing keys with defaults. */
function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem('trustSettings'));
    if (!stored) return defaults();

    // Back-compat / missing-key guards
    if (typeof stored.cgApiKey    === 'undefined') stored.cgApiKey    = '';
    if (typeof stored.cgApiKeyPro === 'undefined') stored.cgApiKeyPro = false;
    if (typeof stored.usdtNetwork === 'undefined') stored.usdtNetwork = 'trc20';
    if (typeof stored.walletName  === 'undefined') stored.walletName  = 'Ascend2k';
    if (!stored.currency)                          stored.currency    = 'usd';
    if (!stored.coins)                             stored.coins       = defaults().coins;

    for (const key of Object.keys(COINGECKO_IDS)) {
      if (typeof stored.coins[key] === 'undefined') stored.coins[key] = 0;
    }
    return stored;
  } catch {
    return defaults();
  }
}

/** Persist settings to localStorage. */
function saveSettings(settings) {
  localStorage.setItem('trustSettings', JSON.stringify(settings));
}

// ── Price cache helpers ───────────────────────────────────────────────────────

/**
 * Return cached price data for a given coin + currency pair,
 * or null if the cache is missing / stale.
 */
function getCachedPrice(coinKey, currency) {
  try {
    const raw = localStorage.getItem('tprice_' + coinKey + '_' + currency);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.ts > PRICE_CACHE_MS) return null;
    return data;   // { price, change24h, ts }
  } catch {
    return null;
  }
}

/** Write price data into the localStorage cache. */
function setCachedPrice(coinKey, currency, price, change24h) {
  localStorage.setItem(
    'tprice_' + coinKey + '_' + currency,
    JSON.stringify({ price, change24h, ts: Date.now() })
  );
}

// ── Price fetching ────────────────────────────────────────────────────────────

/**
 * Fetch fresh prices from the /api/prices proxy for all tracked coins.
 * @param {boolean} forceRefresh  Skip the "all cached?" early-return check.
 */
// Define secondary API URL
const SECONDARY_API_URL = 'https://api.coincap.io/v2/assets';

async function fetchAllPrices(forceRefresh = false) {
  const settings = loadSettings();
  const apiKey = settings.cgApiKey || '';
  const isPro = !!settings.cgApiKeyPro;
  const currency = settings.currency || 'usd';

  // Track last used API in localStorage
  const lastApiUsed = localStorage.getItem('lastPriceApi') || 'coingecko';

  // Check cache if not forced
  if (!forceRefresh) {
    const allCached = Object.keys(COINGECKO_IDS).every(k => getCachedPrice(k, currency));
    if (allCached) return;
  }

  // Try primary API (CoinGecko)
  let success = false;
  try {
    let url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + Object.values(COINGECKO_IDS).join(',') + '&vs_currencies=' + currency + '&include_24hr_change=true&_t=' + Date.now();
    if (apiKey) {
      url += '&x_cg_' + (isPro ? 'pro' : 'demo') + '_api_key=' + encodeURIComponent(apiKey);
    }
    const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      for (const [coinKey, geckoId] of Object.entries(COINGECKO_IDS)) {
        if (data[geckoId]) {
          setCachedPrice(coinKey, currency, data[geckoId][currency], data[geckoId][currency + '_24h_change']);
        }
      }
      localStorage.setItem('lastPriceApi', 'coingecko');
      success = true;
    } else {
      throw new Error('CoinGecko response not ok');
    }
  } catch (err) {
    console.warn('CoinGecko fetch failed, trying fallback API:', err);
  }

  // If primary failed, try secondary API
  if (!success) {
    try {
      const response = await fetch(SECONDARY_API_URL);
      if (response.ok) {
        const data = await response.json();
        // Map data to your cache
        for (const [coinKey, geckoId] of Object.entries(COINGECKO_IDS)) {
          const coinData = data.data.find(c => c.id === geckoId);
          if (coinData) {
            const price = parseFloat(coinData.priceUsd);
            // CoinCap doesn't provide 24h change directly, so you might skip or fetch separately
            setCachedPrice(coinKey, currency, price, 0);
          }
        }
        localStorage.setItem('lastPriceApi', 'coincap');
        success = true;
      } else {
        throw new Error('CoinCap response not ok');
      }
    } catch (err) {
      console.error('Fallback API fetch failed:', err);
    }
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Return the currency symbol for the currently selected currency. */
function getCurrencySymbol() {
  const settings = loadSettings();
  const cur = CURRENCIES[settings.currency] || CURRENCIES['usd'];
  return cur.symbol;
}

/** Format a fiat value with the active currency symbol and two decimal places. */
function fmtUSD(value) {
  const symbol = getCurrencySymbol();
  const formatted = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol + formatted;
}

/** Format a coin amount with up to 6 decimal places. */
function fmtAmount(amount) {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

// ── Core wallet update ────────────────────────────────────────────────────────

/**
 * Refresh prices (if needed) then rebuild every DOM element that shows
 * wallet data: total balance, daily-change line, and the asset list.
 * @param {boolean} forceRefresh  Pass true to bypass the price cache.
 * @returns {Promise<void>}
 */
async function updateWallet(forceRefresh = false) {
  await fetchAllPrices(forceRefresh);
  renderWalletFromSettings();
}

function renderWalletFromSettings() {
  const settings = loadSettings();
  const coins    = settings.coins || {};
  const currency = settings.currency || 'usd';

  // Build per-asset rows ─────────────────────────────────────────────────────
  const assetRows = [];
  for (const coinKey of Object.keys(COINGECKO_IDS)) {
    const amount      = parseFloat(coins[coinKey]) || 0;
    const cached      = getCachedPrice(coinKey, currency);
    const price       = cached ? cached.price    : 0;
    const change24h   = cached ? cached.change24h : 0;
    const value       = amount * price;

    assetRows.push({
      key:         coinKey,
      amount,
      value,
      change:      change24h,
      price,
      usdtNetwork: coinKey === 'usdt' ? (settings.usdtNetwork || 'trc20') : null,
    });
  }

  // Sort descending by fiat value
  assetRows.sort((a, b) => b.value - a.value);

  // Total portfolio value
  const totalValue = assetRows.reduce((sum, row) => sum + row.value, 0);

  // Absolute 24 h gain/loss in fiat
  const totalChange = assetRows.reduce((sum, row) => {
    if (row.value > 0 && row.change !== 0) {
      const prevValue = row.value / (1 + row.change / 100);
      return sum + (row.value - prevValue);
    }
    return sum;
  }, 0);

  // Weighted-average 24 h % change across all held assets
  const weightedChangePct = totalValue > 0
    ? assetRows.reduce((sum, row) => sum + (row.value / totalValue) * (row.change || 0), 0)
    : 0;

  // ── Update wallet name display ─────────────────────────────────────────────
  const nameEl = document.getElementById('walletNameDisplay');
  if (nameEl) nameEl.textContent = settings.walletName || 'Ascend2k';

  // ── Update total balance ───────────────────────────────────────────────────
  const balanceEl = document.getElementById('totalBalance');
  if (balanceEl) balanceEl.textContent = fmtUSD(totalValue);

  // ── Update daily change line ───────────────────────────────────────────────
  const changeEl = document.querySelector('.daily-change-value');
  if (changeEl) {
    const isPositive = totalChange >= 0;
    const color      = isPositive ? '#23BF7D' : '#FF5C5C';

    // SVG arrows (up / down)
    const upArrow = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" style="vertical-align:middle;fill:${color};flex-shrink:0"><path d="M300.3 199.2C312.9 188.9 331.4 189.7 343.1 201.4L471.1 329.4C480.3 338.6 483 352.3 478 364.3C473 376.3 461.4 384 448.5 384L192.5 384C179.6 384 167.9 376.2 162.9 364.2C157.9 352.2 160.7 338.5 169.9 329.4L297.9 201.4L300.3 199.2z"/></svg>`;
    const downArrow = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" style="vertical-align:middle;fill:${color};flex-shrink:0"><path d="M300.3 440.8C312.9 451 331.4 450.3 343.1 438.6L471.1 310.6C480.3 301.4 483 287.7 478 275.7C473 263.7 461.4 256 448.5 256L192.5 256C179.6 256 167.9 263.8 162.9 275.8C157.9 287.8 160.7 301.5 169.9 310.6L297.9 438.6L300.3 440.8z"/></svg>`;
    const arrow = isPositive ? upArrow : downArrow;

    changeEl.innerHTML =
      `<span style="color:${color};display:inline-flex;align-items:center;gap:3px">` +
      arrow +
      fmtUSD(Math.abs(totalChange)) +
      ' (' + Math.abs(weightedChangePct).toFixed(2) + '%)</span>';
  }

  renderAssets(assetRows);
}

// ── Asset list renderer ───────────────────────────────────────────────────────

/**
 * Re-render the asset list in #assetList.
 * Skips coins with zero balance.
 * @param {Array} assetRows  Sorted array produced by updateWallet().
 */
function renderAssets(assetRows) {
  const listEl = document.getElementById('assetList');
  if (!listEl) return;
  listEl.innerHTML = '';

  for (const row of assetRows) {
    if (row.amount <= 0) continue;

    const isPositive   = row.change >= 0;
    const changeColor  = row.change === 0 ? '#888888' : isPositive ? '#23BF7D' : '#FF5C5C';
    const changePrefix = row.change === 0 ? '' : isPositive ? '+' : '-';
    const changePct    = Math.abs(row.change).toFixed(2);
    const displayPrice = row.price > 0 ? fmtUSD(row.price) : '—';

    // For USDT, use the user-selected network label/badge; otherwise use the static network.
    const networkLabel = COIN_SYMBOLS[row.key];

    // Optional USDT network badge overlay
    const usdtBadge = row.key === 'usdt'
      ? `<div class="absolute -bottom-px -right-0.5" style="border-radius:50%;box-shadow:0 0 3px 1px rgba(35,191,125,0.07);">` +
        `<div class="flex items-center justify-center w-full h-full flex-1 flex-row">` +
        `<div class="rounded-full overflow-hidden bg-backgroundPrimary">` +
        `<div class="w-4 h-4 flex items-center">` +
        `<img alt="${USDT_NETWORKS[row.usdtNetwork].label}" class="w-full h-full rounded-full object-contain border-1" src="${USDT_NETWORKS[row.usdtNetwork].badge}">` +
        `</div></div></div></div>`
      : '';

    const el = document.createElement('div');
    el.setAttribute('data-testid', 'asset-row');
    el.setAttribute('role', 'button');
    el.className = 'outline-0 cursor-pointer';

    el.innerHTML = `
      <div class="flex justify-between space-x-3 py-2 cursor-pointer items-center">
        <div class="relative min-w-min" style="border-radius:50%;box-shadow:0 0 4px 1px rgba(35,191,125,0.08);">
          <div class="flex items-center justify-center w-full h-full flex-1 flex-row">
            <div class="rounded-full overflow-hidden">
              <div class="w-10 h-10 flex items-center">
                <img alt="${COIN_NAMES[row.key]}" class="w-full h-full rounded-full object-contain" src="${COIN_ICONS[row.key]}">
              </div>
            </div>
          </div>
          ${usdtBadge}
        </div>
        <div class="flex-grow space-y-1">
          <div class="flex flex-row space-x-1 items-center">
            <p data-testid="asset-symbol" class="typography-body-16 text-utility-1-default font-medium">${networkLabel}</p>
          </div>
          <div>
          </div>
          <div class="flex flex-row space-x-1 items-center">
            <p data-testid="asset-fiat-price" class="typography-body-12 text-utility-1-opacity-1 font-normal">${displayPrice}</p>
            <p data-testid="asset-fiat-percentage-change" class="typography-body-12 font-normal" style="color:${changeColor}">${changePrefix} ${changePct}%</p>
          </div>
        </div>
        <div class="text-right space-y-1">
          <div>
            <p data-testid="asset-crypto-balance" class="typography-body-16 text-utility-1-default font-medium">${fmtAmount(row.amount)}</p>
          </div>
          <div>
            <span class="text-textSecondary typography-body-12" data-testid="asset-fiat-balance">${fmtUSD(row.value)}</span>
          </div>
        </div>
      </div>
    `;
    listEl.appendChild(el);
  }
}

// ── Settings panel ────────────────────────────────────────────────────────────

/** Populate every input in the settings overlay from localStorage, then show it. */
function openSettings() {
  const s = loadSettings();

  const getVal = (key) => {
    const cached = getCachedPrice(key, s.currency);
    const price = cached ? cached.price : 0;
    return ((s.coins[key] || 0) * price).toFixed(2);
  };

  document.getElementById('set-sol').value  = getVal('sol');
  document.getElementById('set-btc').value  = getVal('btc');
  document.getElementById('set-eth').value  = getVal('eth');
  document.getElementById('set-trx').value  = getVal('trx');
  document.getElementById('set-bnb').value  = getVal('bnb');
  document.getElementById('set-usdt').value = getVal('usdt');
  
  // ... rest of the openSettings function remains the same ...
  document.getElementById('set-cgApiKey').value   = s.cgApiKey   || '';
  document.getElementById('set-cgApiKeyPro').checked = !!s.cgApiKeyPro;
  document.getElementById('set-currency').value   = s.currency   || 'usd';
  document.getElementById('set-usdtNetwork').value = s.usdtNetwork || 'trc20';
  document.getElementById('set-walletName').value = s.walletName  || 'Ascend2k';

  document.getElementById('settingsOverlay').classList.add('open');
}

/** Hide the settings overlay. */
function closeSettings() {
  document.getElementById('settingsOverlay').classList.remove('open');
}

/**
 * Read every form input, persist to localStorage, clear stale price caches
 * for the old currency, then refresh the wallet display.
 */
// Full confirmSettings() function
function confirmSettings() {
  const s = loadSettings();
  const oldCurrency = s.currency || 'usd';

  s.coins.sol  = parseFloat(document.getElementById('set-sol').value)  || 0;
  s.coins.btc  = parseFloat(document.getElementById('set-btc').value)  || 0;
  s.coins.eth  = parseFloat(document.getElementById('set-eth').value)  || 0;
  s.coins.trx  = parseFloat(document.getElementById('set-trx').value)  || 0;
  s.coins.bnb  = parseFloat(document.getElementById('set-bnb').value)  || 0;
  s.coins.usdt = parseFloat(document.getElementById('set-usdt').value) || 0;

  s.cgApiKey    = document.getElementById('set-cgApiKey').value.trim();
  s.cgApiKeyPro = document.getElementById('set-cgApiKeyPro').checked;
  s.currency    = document.getElementById('set-currency').value || 'usd';
  s.usdtNetwork = document.getElementById('set-usdtNetwork').value || 'trc20';
  s.walletName  = document.getElementById('set-walletName').value.trim() || 'Ascend2k';

  // Update wallet name display immediately
  const nameEl = document.getElementById('walletNameDisplay');
  if (nameEl) nameEl.textContent = s.walletName;

  // Invalidate price cache only if currency changed (keep current-currency cache for instant render)
  if (oldCurrency !== s.currency) {
    for (const coinKey of Object.keys(COINGECKO_IDS)) {
      localStorage.removeItem('tprice_' + coinKey + '_' + oldCurrency);
    }
  }

  // Save settings
  saveSettings(s);
  // Close overlay
  closeSettings();
  // Render immediately from stored prices without any network wait, then refresh in background
  renderWalletFromSettings();
  updateWallet(true);
}

// Make sure to add this event listener in your DOMContentLoaded:
document.getElementById('settingsConfirm').addEventListener('click', confirmSettings);
// X button: auto-save and close
const _settingsCloseBtn = document.getElementById('settingsClose');
if (_settingsCloseBtn) _settingsCloseBtn.addEventListener('click', confirmSettings);
// Also auto-save when clicking the dark backdrop
const _settingsOverlayEl = document.getElementById('settingsOverlay');
if (_settingsOverlayEl) _settingsOverlayEl.addEventListener('click', (e) => {
  if (e.target === _settingsOverlayEl) confirmSettings();
});

// ── Pull-to-refresh ───────────────────────────────────────────────────────────

/**
 * Attach touch listeners to #ptr-wrapper so dragging down triggers a refresh.
 * The #content-wrapper translates downward as the user pulls; the #pullSpinner
 * fades in and its blades fill up proportionally to the drag distance.
 *
 * Thresholds (px, before the 0.45 damping factor is applied):
 *   TRIGGER_PX = 70  → minimum pull to fire a refresh
 *   SNAP_PX    = 62  → where the spinner rests while loading
 */
function initPullToRefresh() {
  const scrollEl  = document.getElementById('ptr-wrapper');
  const wrapperEl = document.getElementById('content-wrapper');
  const spinnerEl = document.getElementById('pullSpinner');
  if (!scrollEl || !wrapperEl || !spinnerEl) return;

  const blades     = Array.from(spinnerEl.querySelectorAll('.spinner-blade'));
  const bladeCount = blades.length;
  const TRIGGER_PX = 70;   // damped px to fire refresh
  const SNAP_PX    = 62;   // damped px to rest spinner at
  const DAMPING    = 0.45; // drag → visual translation ratio

  let startY    = 0;
  let pullDelta = 0;
  let pulling   = false;
  let loading   = false;

  spinnerEl.style.transition = 'transform 0.3s cubic-bezier(0.25,1,0.5,1)';
  resetSpinner();

  // ── Helpers ──────────────────────────────────────────────────────────────

  function resetSpinner() {
    spinnerEl.style.transition = 'transform 0.3s cubic-bezier(0.25,1,0.5,1)';
    spinnerEl.style.transform  = 'translateX(-50%) scale(0)';
    spinnerEl.style.opacity    = '0';
    blades.forEach(b => {
      b.style.animationName = 'none';
      b.style.opacity       = '0';
      b.style.backgroundColor = 'transparent';
    });
  }

  /** Fill blades up to `progress` (0–1). */
  function setBladeProgress(progress) {
    const filledCount = Math.min(Math.floor(progress * (bladeCount + 1)), bladeCount);
    blades.forEach((blade, i) => {
      blade.style.animationName    = 'spinner-fade-grey';
      blade.style.opacity          = i < filledCount ? '1' : '0';
      blade.style.backgroundColor = i < filledCount ? '#888' : 'transparent';
    });
  }

  /** Activate the spinner's CSS animation on all blades (loading state). */
  function startSpinnerAnimation() {
    blades.forEach(b => {
      b.style.opacity         = '';
      b.style.backgroundColor = '';
      b.style.animationName   = 'spinner-fade-grey';
    });
  }

  /** Slide content and spinner back to their resting positions. */
  function snapBack() {
    wrapperEl.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    wrapperEl.style.transform  = 'translateY(0)';
    resetSpinner();
    loading = false;
  }

  // ── Touch events ──────────────────────────────────────────────────────────

  scrollEl.addEventListener('touchstart', e => {
    if (scrollEl.scrollTop > 0) return;  // only trigger at the very top
    startY    = e.touches[0].clientY;
    pullDelta = 0;
    pulling   = true;
    wrapperEl.style.transition = 'transform 0.3s cubic-bezier(0.25,1,0.5,1)';
    spinnerEl.style.transition = 'transform 0.3s cubic-bezier(0.25,1,0.5,1)';
  }, { passive: true });

  scrollEl.addEventListener('touchmove', e => {
    if (!pulling) return;
    const rawDelta = e.touches[0].clientY - startY;
    if (rawDelta <= 0) {
      pullDelta = 0;
      wrapperEl.style.transform = 'translateY(0)';
      resetSpinner();
      return;
    }
    e.preventDefault();
    pullDelta = rawDelta;

    const dampedY = pullDelta * DAMPING;
    wrapperEl.style.transform = `translateY(${dampedY}px)`;

    const progress = Math.min(dampedY / TRIGGER_PX, 1);
    spinnerEl.style.transform = `translateX(-50%) scale(${progress})`;
    spinnerEl.style.opacity   = progress.toString();
    setBladeProgress(progress);
  }, { passive: false });

  scrollEl.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    const dampedY = pullDelta * DAMPING;

    wrapperEl.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    spinnerEl.style.transition = 'transform 0.3s cubic-bezier(0.25,1,0.5,1)';

    if (dampedY >= TRIGGER_PX) {
      // Snap spinner to its resting snap position and start refresh
      wrapperEl.style.transform = `translateY(${SNAP_PX}px)`;
      spinnerEl.style.transform = 'translateX(-50%) scale(1)';
      spinnerEl.style.opacity   = '1';
      startSpinnerAnimation();
      loading = true;
      updateWallet(true).then(() => {
        setTimeout(snapBack, 800);
      });
    } else {
      // Not far enough – bounce back
      wrapperEl.style.transform = 'translateY(0)';
      resetSpinner();
    }
    pullDelta = 0;
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // ... existing button listeners ...
  const settingsBtn = document.querySelector('[data-testid="wallet-header-settings-button"]');
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);

  initPullToRefresh();
  updateWallet();

  // ADD THIS LINE: Refresh every 15 seconds
  setInterval(() => {
    updateWallet(true); 
  }, 15000);
});

// Prevent right-click context menu (cosmetic / anti-inspect)
document.addEventListener('contextmenu', e => e.preventDefault());

// Block F12 / DevTools shortcut keys (Ctrl+Shift+I etc.)
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.keyCode === 123) {
    e.preventDefault();
    e.stopPropagation();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Wallet Action Flows: Send / Receive / Swap / Buy
// UI + animations only (no on-chain logic)
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // Catalog: tokens that can appear in the picker (wallet holdings + extras)
  // Network badge is shown bottom-right of the icon when token isn't a base coin.
  const ICON_BNB = 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/smartchain/info/logo.png';
  const ICON_TRX = 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/tron/info/logo.png';
  const ICON_ETH = 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/ethereum/info/logo.png';
  const ICON_SOL = 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/solana/info/logo.png';
  const ICON_BTC = 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/bitcoin/info/logo.png';

  const CHAIN_FILTERS = [
    { key: 'all', label: 'All', icon: null },
    { key: 'btc', icon: ICON_BTC },
    { key: 'eth', icon: ICON_ETH },
    { key: 'sol', icon: ICON_SOL },
    { key: 'bnb', icon: ICON_BNB },
    { key: 'trx', icon: ICON_TRX },
    { key: 'avax', icon: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/avalanchec/info/logo.png' },
    { key: 'base', icon: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/base/info/logo.png' },
  ];

  // Token catalog used in send picker (wallet + extras seen in reference)
  const CATALOG = [
    { sym: 'USDT', name: 'Tether USDT', chain: 'trx',  net: 'Tron',           icon: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0x55d398326f99059fF775485246999027B3197955/logo.png', netIcon: ICON_TRX, addr: 'TWzZfuU...PyzTzHZ' },
    { sym: 'SOL',  name: 'Solana',      chain: 'sol',  net: 'Solana',         icon: ICON_SOL,                                                                                                                                                                                netIcon: ICON_SOL, addr: 'NZXLnHx...GGRxHh7' },
    { sym: 'MSVP', name: 'MSV Protocol',chain: 'bnb',  net: 'BNB Smart Chain',icon: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/smartchain/info/logo.png', netIcon: ICON_BNB, addr: '0xe49e0...b3B5624' },
    { sym: 'TON',  name: 'TON',         chain: 'ton',  net: 'TON',            icon: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/ton/info/logo.png',          netIcon: null,    addr: 'UQB1...x7Pg' },
    { sym: 'TRX',  name: 'Tron',        chain: 'trx',  net: 'Tron',           icon: ICON_TRX,                                                                                          netIcon: ICON_TRX, addr: 'T9yD...x88f' },
    { sym: 'HEX',  name: 'HEX',         chain: 'eth',  net: 'Ethereum',       icon: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/ethereum/assets/0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39/logo.png', netIcon: ICON_ETH, addr: '0xe49e0...b3B5624' },
    { sym: 'STRX', name: 'Staked TRX',  chain: 'trx',  net: 'Tron',           icon: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/tron/info/logo.png',          netIcon: ICON_TRX, addr: 'T9yD...x88f' },
    { sym: 'AVAX', name: 'Avalanche C-Chain', chain: 'avax', net: 'Avalanche C-Chain', icon: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/avalanchec/info/logo.png', netIcon: null, addr: '0x9aa...xx12' },
    { sym: 'BTC',  name: 'Bitcoin',     chain: 'btc',  net: 'Bitcoin',        icon: ICON_BTC,                                                                                          netIcon: null,    addr: 'bc1qymxts7gx8uirw88rc7v2rhscz7mjmg2vxk9ge7' },
    { sym: 'ETH',  name: 'Ethereum',    chain: 'eth',  net: 'Ethereum',       icon: ICON_ETH,                                                                                          netIcon: null,    addr: '0xe49e04F40C272F405eCB9a668a73EEAD4b3B5624' },
    { sym: 'TWT',  name: 'Trust Wallet Token', chain: 'bnb', net: 'BNB Smart Chain', icon: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0x4B0F1812e5Df2A09796481Ff14017e6005508003/logo.png', netIcon: ICON_BNB, addr: '0xe49e0...b3B5624' },
    { sym: 'BNB',  name: 'BNB',         chain: 'bnb',  net: 'BNB Smart Chain',icon: ICON_BNB,                                                                                          netIcon: null,    addr: '0xe49e0...b3B5624' },
    { sym: 'USDC', name: 'USD Coin',    chain: 'eth',  net: 'Ethereum',       icon: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png', netIcon: ICON_ETH, addr: '0xe49e0...b3B5624' },
  ];

  const POPULAR_KEYS = ['BTC','ETH','SOL','TWT','BNB','USDT','USDC'];

  // ── Per-device address generation ────────────────────
  const _B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const _BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const _HEX = '0123456789abcdef';
  const _HEXM = '0123456789abcdefABCDEF';
  function _rand(n, charset) {
    const a = (window.crypto || window.msCrypto).getRandomValues(new Uint8Array(n));
    let s = ''; for (let i = 0; i < n; i++) s += charset[a[i] % charset.length];
    return s;
  }
  function _genAddr(chain, sym) {
    switch (chain) {
      case 'btc':  return 'bc1q' + _rand(38, _BECH32);
      case 'eth':  return '0x' + _rand(40, _HEXM);
      case 'bnb':  return '0x' + _rand(40, _HEXM);
      case 'avax': return '0x' + _rand(40, _HEXM);
      case 'sol':  return _rand(43 + (Math.random()<.5?1:0), _B58);
      case 'trx':  return 'T' + _rand(33, _B58);
      case 'ton':  return 'UQ' + _rand(46, _B58);
      default:     return '0x' + _rand(40, _HEXM);
    }
  }
  function getDeviceAddrs() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem('tw_addrs') || '{}'); } catch {}
    let changed = false;
    CATALOG.forEach(t => {
      const k = t.sym + '_' + t.chain;
      if (!stored[k]) { stored[k] = _genAddr(t.chain, t.sym); changed = true; }
    });
    if (changed) localStorage.setItem('tw_addrs', JSON.stringify(stored));
    return stored;
  }
  function addrFor(t) {
    const all = getDeviceAddrs();
    return all[t.sym + '_' + t.chain] || t.addr;
  }
  // Replace catalog addrs with per-device ones at load time
  (function _seedAddrs() {
    const all = getDeviceAddrs();
    CATALOG.forEach(t => { t.addr = all[t.sym + '_' + t.chain] || t.addr; });
  })();

  // ── DOM helpers ─────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function openOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.classList.contains('full-page')) {
      el.style.display = 'flex';
    } else {
      el.style.display = 'flex';
    }
    // force reflow then add open
    void el.offsetWidth;
    el.classList.add('open');
    document.body.classList.add('wf-modal-open');
    el.setAttribute('aria-hidden', 'false');
  }
  function closeOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      el.style.display = 'none';
      // any open page/overlay still open?
      const stillOpen = $$('.full-page.open, .tp-overlay.open').length > 0;
      if (!stillOpen) document.body.classList.remove('wf-modal-open');
    }, 360);
  }

  // ── Token Picker ────────────────────────────────────
  let tpMode = 'send'; // 'send' | 'receive'
  let tpChain = 'all';
  let tpQuery = '';

  function renderChains() {
    const wrap = $('#tpChains');
    wrap.innerHTML = '';
    CHAIN_FILTERS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'tp-chip' + (c.key === tpChain ? ' active' : '');
      if (c.key === 'all') {
        b.classList.add('tp-chip-all');
        b.textContent = 'All';
      } else {
        const im = document.createElement('img'); im.src = c.icon; im.alt = c.key;
        b.appendChild(im);
      }
      b.addEventListener('click', () => { tpChain = c.key; renderChains(); renderTokens(); });
      wrap.appendChild(b);
    });
  }

  function tokenRow(t) {
    const row = document.createElement('div');
    row.className = 'tp-row';
    const iconWrap = `<div class="tp-row-icon-wrap"><img class="tp-row-icon" src="${t.icon}" alt="">${t.netIcon ? `<img class="tp-row-net-badge" src="${t.netIcon}" alt="">` : ''}</div>`;
    if (tpMode === 'send') {
      const balance = balanceFor(t);
      const fiat = fiatFor(t, balance);
      row.innerHTML = `${iconWrap}
        <div class="tp-row-text">
          <div class="tp-row-name">${t.sym} <span class="tp-row-net">${t.net}</span></div>
          <div class="tp-row-sub">${t.name}</div>
        </div>
        <div>
          <div class="tp-row-amount">${formatBal(balance)}</div>
          <div class="tp-row-amount-sub">${fiat}</div>
        </div>`;
      row.addEventListener('click', () => { closeOverlay('tpOverlay'); openSendDetail(t); });
    } else {
      row.innerHTML = `${iconWrap}
        <div class="tp-row-text">
          <div class="tp-row-name">${t.sym} <span class="tp-row-net">${t.net}</span></div>
          <div class="tp-row-sub">${shortAddr(t.addr)}</div>
        </div>
        <div class="tp-row-qr-btns">
          <button class="tp-row-qr-btn" aria-label="QR"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="16" y="16" width="3" height="3" fill="currentColor"/></svg></button>
          <button class="tp-row-qr-btn" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.6"/></svg></button>
        </div>`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.tp-row-qr-btn')) { e.stopPropagation(); }
        closeOverlay('tpOverlay'); openReceiveDetail(t);
      });
    }
    return row;
  }

  function shortAddr(a) { if (!a) return ''; return a.length <= 18 ? a : a.slice(0,7)+'...'+a.slice(-7); }
  function balanceFor(t) {
    const s = loadSettings();
    const k = t.sym.toLowerCase();
    if (k in s.coins) return s.coins[k];
    // fake non-zero for extras seen in reference
    const seeds = { msvp: 0.6581, ton: 0.0003, hex: 0.001, strx: 0, avax: 0, twt: 0, usdc: 0 };
    return seeds[k] || 0;
  }
  function fiatFor(t, bal) {
    const sym = getCurrencySymbol();
    if (!bal) {
      const tiny = { msvp: '$0.01', ton: '$0.0004493', hex: '$0.0₅6000', strx: '$0.0₅1112', avax: '$0.0₅1722' };
      return tiny[t.sym.toLowerCase()] || `${sym}0.00`;
    }
    return `${sym}${(bal * 1).toFixed(2)}`;
  }
  function formatBal(b) {
    if (!b) return '0';
    if (b < 0.01) return b.toFixed(6);
    return b.toFixed(b < 1 ? 4 : 3);
  }

  function renderTokens() {
    const filter = (t) => (tpChain === 'all' || t.chain === tpChain) && (!tpQuery || t.sym.toLowerCase().includes(tpQuery) || t.name.toLowerCase().includes(tpQuery));
    if (tpMode === 'send') {
      $('#tpPopularLabel').style.display = 'none';
      $('#tpPopular').style.display = 'none';
      $('#tpAllLabel').style.display = 'none';
      const list = $('#tpList');
      list.innerHTML = '';
      CATALOG.filter(filter).forEach(t => list.appendChild(tokenRow(t)));
    } else {
      $('#tpPopularLabel').style.display = 'block';
      $('#tpPopular').style.display = 'block';
      $('#tpAllLabel').style.display = 'block';
      const popular = CATALOG.filter(t => POPULAR_KEYS.includes(t.sym) && filter(t));
      const all = CATALOG.filter(t => !POPULAR_KEYS.includes(t.sym) && filter(t));
      const popList = $('#tpPopular'); popList.innerHTML = '';
      popular.forEach(t => popList.appendChild(tokenRow(t)));
      const list = $('#tpList'); list.innerHTML = '';
      all.forEach(t => list.appendChild(tokenRow(t)));
    }
  }

  function openTokenPicker(mode) {
    tpMode = mode; tpChain = 'all'; tpQuery = '';
    $('#tpTitle').textContent = mode === 'send' ? 'Send' : 'Receive';
    $('#tpSearch').value = '';
    renderChains(); renderTokens();
    openOverlay('tpOverlay');
  }

  // ── Send detail ─────────────────────────────────────
  let sendToken = null;
  function openSendDetail(t) {
    sendToken = t;
    $('#sendCoinSym').textContent = t.sym;
    $('#sendAmountSym').textContent = t.sym;
    $('#sendNetName').textContent = t.net;
    $('#sendNetIcon').src = t.netIcon || t.icon;
    $('#sendAddr').value = '';
    $('#sendAmount').value = '';
    $('#sendAmountFiat').textContent = '≈ $0.00';
    $('#sendMemo').value = '';
    $('#sendNext').disabled = true;
    openOverlay('sendPage');
  }
  function updateSendNextState() {
    const ok = $('#sendAddr').value.trim().length > 0 && parseFloat($('#sendAmount').value) > 0;
    $('#sendNext').disabled = !ok;
  }

  // ── Receive detail ──────────────────────────────────
  function openReceiveDetail(t) {
    $('#rcvCoinName').textContent = `${t.name.replace(/ \(.*\)/,'')} (${t.sym})`;
    $('#rcvCoinSym').textContent = t.sym;
    $('#rcvCoinNet').textContent = t.net;
    $('#rcvCoinIcon').src = t.icon;
    const a = addrFor(t);
    $('#rcvAddr').textContent = a;
    // QR via external generator
    const q = encodeURIComponent(a);
    $('#rcvQr').innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=${q}" alt="">`;
    openOverlay('receivePage');
  }

  // ── Swap ────────────────────────────────────────────
  let swState = {
    from: CATALOG.find(t => t.sym === 'USDT'),
    to: CATALOG.find(t => t.sym === 'ETH'),
    amount: '0',
    quote: null,         // null | 'fetching' | { out, fiatIn, fiatOut, minRecv }
    fetchTimer: null,
  };

  function fmtAmount(s) {
    if (!s || s === '0') return '0';
    return s;
  }
  function setSwInputs() {
    $('#swFromSym').textContent = swState.from.sym;
    $('#swFromIcon').src = swState.from.icon;
    $('#swToSym').textContent = swState.to.sym;
    $('#swToIcon').src = swState.to.icon;
    $('#swFromAmount').value = fmtAmount(swState.amount);
    $('#swFromBal').textContent = formatBal(balanceFor(swState.from));
  }
  function swQuoteCalc() {
    const a = parseFloat(swState.amount) || 0;
    if (a <= 0) { swState.quote = null; renderSwap(); return; }
    swState.quote = 'fetching';
    renderSwap();
    if (swState.fetchTimer) clearTimeout(swState.fetchTimer);
    swState.fetchTimer = setTimeout(() => {
      // Fake quote: 1 ETH = 2301.857983 USDT  → reverse
      const rate = (swState.from.sym === 'USDT' && swState.to.sym === 'ETH') ? (1/2301.857983) : 0.000434;
      const out = a * rate;
      const fiatIn = a * 1;       // assume USDT≈$1
      const fiatOut = out * 2301.857983;
      swState.quote = {
        out, fiatIn, fiatOut,
        minRecv: out * 0.96,
        rate: 2301.857983,
      };
      renderSwap();
    }, 900);
  }
  function renderSwap() {
    setSwInputs();
    const a = parseFloat(swState.amount) || 0;
    $('#swFromFiat').textContent = a > 0 ? `$${(a).toFixed(2)}` : '$0.00';
    const slide = $('#swSlide');
    const label = $('#swSlideLabel');
    const quoteLine = $('#swQuoteLine');
    const toAmount = $('#swToAmount');
    const toFiat = $('#swToFiat');
    if (a <= 0) {
      toAmount.textContent = '0';
      toFiat.textContent = '$0.00';
      label.textContent = 'Slide to Swap';
      slide.disabled = true;
      slide.classList.remove('ready', 'fetching');
      quoteLine.classList.add('hidden');
      $('#swMinReceived').textContent = '';
      return;
    }
    if (swState.quote === 'fetching') {
      toAmount.textContent = '';
      toFiat.textContent = '';
      label.textContent = 'Fetching quote';
      slide.disabled = true;
      slide.classList.remove('ready');
      slide.classList.add('fetching');
      quoteLine.classList.add('hidden');
      return;
    }
    if (swState.quote && typeof swState.quote === 'object') {
      const q = swState.quote;
      toAmount.textContent = q.out.toFixed(6);
      toFiat.textContent = `$${q.fiatOut.toFixed(2)}`;
      label.textContent = 'Slide to Swap';
      slide.disabled = false;
      slide.classList.remove('fetching');
      slide.classList.add('ready');
      $('#swMinReceived').textContent = `Min. received: ${q.minRecv.toFixed(7)} ${swState.to.sym}`;
      quoteLine.classList.remove('hidden');
    }
  }
  function swPress(k) {
    let s = swState.amount;
    if (k === 'del') {
      s = s.length > 1 ? s.slice(0, -1) : '0';
    } else if (k === '.') {
      if (!s.includes('.')) s = s + '.';
    } else {
      if (s === '0') s = k; else s = s + k;
    }
    swState.amount = s;
    // update slider position
    const bal = balanceFor(swState.from) || 100;
    const pct = Math.min(100, (parseFloat(s)||0) / bal * 100);
    $('#swSliderFill').style.width = pct + '%';
    $('#swSliderThumb').style.left = pct + '%';
    swQuoteCalc();
  }

  function openSwapDetails() {
    if (!(swState.quote && typeof swState.quote === 'object')) return;
    const q = swState.quote;
    const rows = [
      { lbl: 'Rate',         val: `1 ${swState.to.sym} = ${q.rate.toFixed(6)} ${swState.from.sym}` },
      { lbl: 'Min. received', val: `${q.minRecv.toFixed(7)} ${swState.to.sym} <span style="color:var(--wf-text-dim);font-size:12px;">≈ $${(q.minRecv*q.rate).toFixed(2)}</span>` },
      { lbl: 'Slippage',     val: `4% <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="color:var(--wf-green)"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>` },
      { lbl: 'Provider',     val: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 12l8-8 8 8-8 8z" fill="var(--wf-green)"/></svg> SWFT Bridgers` },
      { lbl: 'Network',      val: `<img src="${ICON_ETH}" alt=""> Ethereum` },
      { lbl: 'Swapper fee',  val: `<span style="color:var(--wf-green)">0.70%</span>` },
      { lbl: 'Network fee',  val: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12l3 8h8l3-8-7 4-7-4z" fill="#ff5252"/></svg> $0.00` },
    ];
    $('#swDetailRows').innerHTML = rows.map(r => `<div class="sw-detail-row"><span class="lbl">${r.lbl}</span><span class="val">${r.val}</span></div>`).join('');
    openOverlay('swDetailsOverlay');
  }

  function showOrderSubmitted() {
    $('#swOrderTitle').textContent = `${swState.from.sym} → ${swState.to.sym}`;
    const sugg = [
      { sym: 'TRX', icon: ICON_TRX, pct: '+0.45%' },
      { sym: 'SIREN', icon: 'https://wsrv.nl/?url=https://assets-cdn.trustwallet.com/blockchains/smartchain/info/logo.png', pct: '-1.03%', down: true },
      { sym: 'TKC', icon: ICON_BNB, pct: '+8.42%' },
      { sym: 'GTAN', icon: ICON_ETH, pct: '+2.39%' },
    ];
    $('#swSuggest').innerHTML = sugg.map(s => `<div class="ord-sugg-card"><img src="${s.icon}" alt=""><div class="ord-sugg-sym">${s.sym}</div><div class="ord-sugg-pct ${s.down?'down':''}">${s.pct}</div></div>`).join('');
    openOverlay('swOrderPage');
  }

  // Slide-to-swap: tap-to-fire (no real drag, since reference shows simple slide-style button)
  function bindSwapSlide() {
    const btn = $('#swSlide');
    let down = false, startX = 0;
    btn.addEventListener('pointerdown', e => {
      if (btn.disabled || !btn.classList.contains('ready')) return;
      down = true; startX = e.clientX;
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = Math.max(0, Math.min(btn.offsetWidth - 56, e.clientX - startX));
      $('.sw-slide-thumb').style.left = (4 + dx) + 'px';
    });
    btn.addEventListener('pointerup', e => {
      if (!down) return;
      down = false;
      const dx = e.clientX - startX;
      $('.sw-slide-thumb').style.left = '4px';
      if (dx > btn.offsetWidth * 0.55) {
        // Fire
        closeOverlay('swapPage');
        setTimeout(showOrderSubmitted, 350);
      }
    });
    // Also accept simple tap (when ready)
    btn.addEventListener('click', () => {
      if (btn.disabled || !btn.classList.contains('ready')) return;
      // If pointer up already triggered, this also triggers — but we guard by class change
    });
  }

  function openSwap() {
    swState.amount = '0';
    swState.quote = null;
    $('#swSliderFill').style.width = '0%';
    $('#swSliderThumb').style.left = '0%';
    renderSwap();
    openOverlay('swapPage');
  }
  function flipSwap() {
    const tmp = swState.from; swState.from = swState.to; swState.to = tmp;
    swState.amount = '0'; swState.quote = null;
    $('#swSliderFill').style.width = '0%';
    $('#swSliderThumb').style.left = '0%';
    renderSwap();
  }

  // ── Buy ─────────────────────────────────────────────
  let buyAmount = '250';
  function renderBuy() {
    $('#buyFiatAmount').textContent = buyAmount || '0';
    const a = parseFloat(buyAmount) || 0;
    // mock: 1 BTC = $76,000 (so 250 USD ≈ 0.0032873)
    const out = a / 76045;
    $('#buyCryptoAmount').textContent = out.toFixed(7);
  }
  function buyPress(k) {
    let s = buyAmount;
    if (k === 'del') s = s.length > 1 ? s.slice(0,-1) : '0';
    else if (k === '.') { if (!s.includes('.')) s += '.'; }
    else { if (s === '0') s = k; else s += k; }
    buyAmount = s;
    renderBuy();
  }

  // ── Bind everything on DOM ready ────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // Action buttons
    const sendBtn   = document.querySelector('[data-testid="wallet-board-send-button"]');
    const recvBtn   = document.querySelector('[data-testid="wallet-board-receive-button"]');
    const swapBtn   = document.querySelector('[data-testid="wallet-board-swap-button"]');
    const buyBtn    = document.querySelector('[data-testid="wallet-board-fund-button"]');
    sendBtn && sendBtn.addEventListener('click', () => openTokenPicker('send'));
    recvBtn && recvBtn.addEventListener('click', () => openTokenPicker('receive'));
    swapBtn && swapBtn.addEventListener('click', openSwap);
    buyBtn  && buyBtn.addEventListener('click', () => { buyAmount = '250'; renderBuy(); openOverlay('buyPage'); });

    // Token picker controls
    $('#tpClose').addEventListener('click', () => closeOverlay('tpOverlay'));
    $('#tpOverlay').addEventListener('click', e => { if (e.target.id === 'tpOverlay') closeOverlay('tpOverlay'); });
    $('#tpSearch').addEventListener('input', e => { tpQuery = e.target.value.trim().toLowerCase(); renderTokens(); });

    // Generic close buttons (back / X with data-close="pageId")
    $$('[data-close]').forEach(b => b.addEventListener('click', () => closeOverlay(b.getAttribute('data-close'))));

    // Send page
    $('#sendAddr').addEventListener('input', updateSendNextState);
    $('#sendAmount').addEventListener('input', () => {
      const v = parseFloat($('#sendAmount').value) || 0;
      $('#sendAmountFiat').textContent = `≈ $${v.toFixed(2)}`;
      updateSendNextState();
    });
    $('.fp-paste') && $('.fp-paste').addEventListener('click', async () => {
      try { const t = await navigator.clipboard.readText(); $('#sendAddr').value = t; updateSendNextState(); } catch {}
    });
    $('#sendMax').addEventListener('click', () => {
      const b = balanceFor(sendToken || CATALOG[0]);
      $('#sendAmount').value = b.toString();
      $('#sendAmountFiat').textContent = `≈ $${(b).toFixed(2)}`;
      updateSendNextState();
    });

    // Send Next -> open Confirm
    $('#sendNext').addEventListener('click', () => {
      if ($('#sendNext').disabled) return;
      openSendConfirm();
    });
    $('#sendConfirmContinue').addEventListener('click', startSendProcessing);
    $('#sendProcessingDetails').addEventListener('click', () => {
      closeOverlay('sendProcessingOverlay');
      setTimeout(openSentPage, 250);
    });

    // Receive page actions
    $('#rcvCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('#rcvAddr').textContent.trim()); } catch {}
      const b = $('#rcvCopy'); b.classList.add('copied');
      const lbl = b.querySelector('span:last-child'); const old = lbl.textContent;
      lbl.textContent = 'Copied!';
      setTimeout(() => { b.classList.remove('copied'); lbl.textContent = old; }, 1400);
    });
    $('#rcvShare').addEventListener('click', () => {
      const txt = $('#rcvAddr').textContent.trim();
      if (navigator.share) navigator.share({ text: txt }).catch(() => {});
    });

    // Swap
    $('#swKeypad').addEventListener('click', e => {
      const b = e.target.closest('button[data-k]'); if (!b) return; swPress(b.dataset.k);
    });
    $('#swFlip').addEventListener('click', flipSwap);
    $('#swPricingBtn').addEventListener('click', openSwapDetails);
    $('#swDetailsClose').addEventListener('click', () => closeOverlay('swDetailsOverlay'));
    $('#swDetailsOverlay').addEventListener('click', e => { if (e.target.id === 'swDetailsOverlay') closeOverlay('swDetailsOverlay'); });
    $('#swFromBtn').addEventListener('click', () => {
      // Re-use token picker for "from" change
      tpMode = 'send'; tpChain = 'all'; tpQuery = '';
      $('#tpTitle').textContent = 'Select from';
      $('#tpSearch').value = ''; renderChains();
      // override row click to set "from"
      const list = $('#tpList'); list.innerHTML = '';
      $('#tpPopularLabel').style.display='none'; $('#tpPopular').style.display='none'; $('#tpAllLabel').style.display='none';
      CATALOG.forEach(t => {
        const r = tokenRow(t);
        const newR = r.cloneNode(true);
        newR.addEventListener('click', () => { swState.from = t; closeOverlay('tpOverlay'); swState.amount='0'; swState.quote=null; renderSwap(); $('#swSliderFill').style.width='0%'; $('#swSliderThumb').style.left='0%'; });
        list.appendChild(newR);
      });
      openOverlay('tpOverlay');
    });
    $('#swToBtn').addEventListener('click', () => {
      tpMode = 'send'; tpChain = 'all'; tpQuery='';
      $('#tpTitle').textContent='Select to'; $('#tpSearch').value=''; renderChains();
      const list = $('#tpList'); list.innerHTML='';
      $('#tpPopularLabel').style.display='none'; $('#tpPopular').style.display='none'; $('#tpAllLabel').style.display='none';
      CATALOG.forEach(t => {
        const r = tokenRow(t).cloneNode(true);
        r.addEventListener('click', () => { swState.to = t; closeOverlay('tpOverlay'); swQuoteCalc(); });
        list.appendChild(r);
      });
      openOverlay('tpOverlay');
    });
    bindSwapSlide();
    $('#swOrderDone').addEventListener('click', () => closeOverlay('swOrderPage'));

    // Buy
    $('#buyKeypad').addEventListener('click', e => {
      const b = e.target.closest('button[data-k]'); if (!b) return; buyPress(b.dataset.k);
    });
    $('#buyContinue').addEventListener('click', () => {
      // No-op success toast via existing sonner div would need extra wiring; just close.
      closeOverlay('buyPage');
    });
  });
})();
