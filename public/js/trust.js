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
