const INITIAL_BALANCE = 50000;
const ENTRY_FEE = 5000;
const MAX_JACKPOT = 200000;
const THINK_SECONDS = 60;
const BANKER_THINK_SECONDS = 3;
const CASE_VALUES = [1, 10, 50, 100, 200, 300, 500, 800, 1000, 1200, 1500, 1800, 2000, 2500, 3000, 3200, 3500, 3800, 4000, 4200, 4800, 10000, 20000, 30000, 50000, 80000, 100000, 130000, 160000, 200000];
const GROUP_SIZE = 6;
const GROUP_COUNT = 5;
const GROUP_REWARDS = [800, 700, 600, 500, 400];
const GROUP_BONUS_TOTAL = GROUP_REWARDS.reduce((sum, reward) => sum + reward, 0);
const OFFER_DISCOUNT_BY_ROUND = [0.4, 0.48, 0.55, 0.58, 0.62, 0.66, 0.7, 0.74, 0.78, 0.82, 0.86, 0.9];
const ROUND_PLAN = [5, 4, 4, 3, 3, 3, 2, 2, 1, 1, 1, 1];
let balance = INITIAL_BALANCE;
let active = false;
let playerCase = null;
let remainingValues = [];
let caseValues = [];
let openedValues = [];
let openedCount = 0;
let totalOpenedCount = 0;
let roundIndex = 0;
let groupBonus = 0;
let currentOffer = 0;
let timerId = null;
let bankerThinkId = null;
let bonusQueue = [];
let bonusShowing = false;
let consecutiveNoDeals = 0;
let currentPlayerName = '';
const players = new Map();
let roundModalPending = false;
let offerPending = false;
let unlockedGroups = new Set();

const $ = (id) => document.getElementById(id);
const money = (value) => `¥${Math.round(value).toLocaleString('en-US')}`;

function renderScoreboard() {
  const list = $('scoreboardList');
  const rankings = [...players.entries()].sort((a, b) => b[1] - a[1]);
  list.innerHTML = rankings.length
    ? rankings.map(([name, amount], index) => `<div class="score-row"><span>${index + 1}. ${name}</span><strong>${money(amount)}</strong></div>`).join('')
    : '<span class="empty-score">等待参赛人员登录</span>';
}

function loginPlayer() {
  const name = $('playerNameInput').value.trim();
  if (!name) {
    $('playerNameInput').focus();
    showMessage('请输入用户名后再开始比赛。', 'loss');
    return;
  }
  currentPlayerName = name;
  balance = players.has(name) ? players.get(name) : INITIAL_BALANCE;
  $('loginModal').classList.add('hidden');
  startGame();
}

function switchPlayer() {
  if (currentPlayerName && active) return;
  if (currentPlayerName) players.set(currentPlayerName, balance);
  renderScoreboard();
  $('resultModal').classList.add('hidden');
  $('playerNameInput').value = '';
  $('loginModal').classList.remove('hidden');
  $('playerNameInput').focus();
}

function saveCurrentPlayer() {
  if (currentPlayerName) {
    players.set(currentPlayerName, balance);
    renderScoreboard();
  }
}

function renderPrizeBoard() {
  $('prizeBoard').innerHTML = CASE_VALUES.map((value, index) => `<span class="group-${Math.floor(index / GROUP_SIZE) + 1}" data-value="${value}" data-group="${Math.floor(index / GROUP_SIZE) + 1}">${money(value)}</span>`).join('');
}

function renderCases() {
  const cases = $('cases');
  cases.innerHTML = '';
  for (let i = 1; i <= 30; i += 1) {
    const button = document.createElement('button');
    button.className = 'case' + (active ? '' : ' disabled');
    button.type = 'button';
    button.dataset.value = active && caseValues.length === 30 ? caseValues[i - 1] : '';
    button.innerHTML = `<span class="case-number">CASE ${String(i).padStart(2, '0')}</span><span class="case-seal">◈</span>`;
    button.addEventListener('click', () => {
      if (playerCase === null) selectCase(button);
      else openCase(button);
    });
    cases.appendChild(button);
  }
}

function getRoundIndex() {
  return Math.min(roundIndex, ROUND_PLAN.length - 1);
}

function getRoundTarget() {
  return ROUND_PLAN[getRoundIndex()] || 0;
}

function getRoundOpenedCount() {
  return openedCount;
}

function showRoundPrompt() {
  const roundNumber = getRoundIndex() + 1;
  const available = getRoundTarget();
  $('roundModalTitle').textContent = `第 ${roundNumber} 轮`;
  $('roundModalCount').textContent = `接下来可以选择 ${available} 个箱子`;
  $('roundModalText').textContent = '本轮结束后，资本家将立即开价。';
  $('roundModal').classList.remove('hidden');
  roundModalPending = true;
}

function updateRoundPrompt() {
  const prompt = $('roundPrompt');
  if (!active || playerCase === null) {
    prompt.classList.add('hidden');
    return;
  }
  prompt.classList.add('hidden');
}

function updateStats() {
  $('playerName').textContent = currentPlayerName || '未登录';
  $('balance').textContent = money(balance);
  $('offer').textContent = money(currentOffer);
  $('bonus').textContent = money(groupBonus);
  $('statusText').textContent = active ? (playerCase ? '开箱中' : '选定你的箱子') : '等待开始';
  $('roundText').textContent = `第 ${Math.min(ROUND_PLAN.length, getRoundIndex() + 1)} / ${ROUND_PLAN.length} 轮 · 本轮开 ${ROUND_PLAN[getRoundIndex()] || 0} 个`;
  updateRoundPrompt();
}

function shuffle(values) {
  const shuffled = [...values];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function startGame() {
  if (active) return;
  if (balance < ENTRY_FEE) {
    showMessage('该玩家余额不足，无法支付报名费。', 'loss');
    $('loginModal').classList.remove('hidden');
    return;
  }
  balance -= ENTRY_FEE;
  active = true;
  playerCase = null;
  remainingValues = shuffle(CASE_VALUES);
  caseValues = [...remainingValues];
  openedValues = [];
  openedCount = 0;
  totalOpenedCount = 0;
  roundIndex = 0;
  groupBonus = 0;
  bonusQueue = [];
  bonusShowing = false;
  consecutiveNoDeals = 0;
  currentOffer = 0;
  $('startBtn').disabled = true;
  $('startBtn').style.opacity = '.55';
  showMessage('报名成功！请先选择一个属于你的行李箱，金额会保密到最后。');
  renderPrizeBoard();
  updateStats();
  renderCases();
}

function selectCase(button) {
  if (!active || playerCase !== null) return;
  const value = Number(button.dataset.value);
  const valueIndex = remainingValues.indexOf(value);
  playerCase = remainingValues.splice(valueIndex, 1)[0];
  button.classList.add('owned');
  button.innerHTML = `<span class="case-number">YOUR CASE</span><span class="case-seal">◆</span>`;
  button.disabled = true;
  document.querySelectorAll('.case').forEach((item) => {
    if (!item.classList.contains('owned')) item.classList.add('available');
  });
  showMessage('你的箱子已锁定。点击弹层开始第 1 轮。', 'win');
  updateStats();
  showRoundPrompt();
}

function openCase(button) {
  if (!active || playerCase === null || offerPending || getRoundOpenedCount() >= getRoundTarget() || button.classList.contains('owned') || button.classList.contains('opened')) return;
  const value = Number(button.dataset.value);
  const valueIndex = remainingValues.indexOf(value);
  const openedValue = valueIndex >= 0 ? remainingValues.splice(valueIndex, 1)[0] : remainingValues.shift();
  openedValues.push(openedValue);
  openedCount += 1;
  totalOpenedCount += 1;
  button.classList.add('opened', 'disabled');
  button.innerHTML = `<span class="case-number">OPENED</span><span class="case-value">${money(openedValue)}</span>`;
  button.disabled = true;
  const boardItem = [...$('prizeBoard').children].find((item) => Number(item.dataset.value) === openedValue);
  if (boardItem) {
    boardItem.classList.add('revealed');
    checkGroupUnlock(Number(boardItem.dataset.group));
  }
  const roundComplete = getRoundOpenedCount() >= getRoundTarget();
  showMessage(`已开出 ${money(openedValue)}。${roundComplete ? '本轮已开完，资本家正在准备报价……' : `本轮还可开 ${getRoundTarget() - getRoundOpenedCount()} 个箱子。`}`, openedValue > 100000 ? 'loss' : '');
  updateStats();
  if (totalOpenedCount >= CASE_VALUES.length - 1) finishGame();
  else if (roundComplete) showOffer();
}

function checkGroupUnlock(groupNumber) {
  if (unlockedGroups.has(groupNumber)) return;
  const groupItems = [...$('prizeBoard').children].filter((item) => Number(item.dataset.group) === groupNumber);
  if (!groupItems.every((item) => item.classList.contains('revealed'))) return;
  unlockedGroups.add(groupNumber);
  const reward = GROUP_REWARDS[groupNumber - 1];
  groupBonus += reward;
  bonusQueue.push({ groupNumber, reward });
  showMessage(`第 ${groupNumber} 组金额阶梯已全部开出，组奖励已锁定，将在本局结算时发放。`, 'win');
  showNextBonus();
}

function addGroupBonus() {
  showMessage('已完成一组金额阶梯检查，全部金额开出后将解锁组奖励。', 'win');
}

function showNextBonus() {
  if (bonusShowing || bonusQueue.length === 0) return;
  bonusShowing = true;
  const bonus = bonusQueue.shift();
  $('bonusTitle').textContent = `第 ${bonus.groupNumber} 组奖励解锁！`;
  $('bonusAmount').textContent = money(bonus.reward);
  $('bonusText').textContent = `本组金额阶梯已全部开出，奖励 ${money(bonus.reward)} 已锁定，将在本局结算时发放。点击继续后，资本家将思考 3 秒并开价。`;
  $('bonusModal').classList.remove('hidden');
}

function calculateOffer() {
  const averageRemaining = remainingValues.reduce((sum, value) => sum + value, 0) / remainingValues.length;
  const averageOpened = openedValues.length ? openedValues.reduce((sum, value) => sum + value, 0) / openedValues.length : 0;
  const currentRoundIndex = getRoundIndex();
  let discount = OFFER_DISCOUNT_BY_ROUND[currentRoundIndex] || 0.9;
  discount -= Math.min(0.15, consecutiveNoDeals * 0.05);
  if (Math.max(...remainingValues) < ENTRY_FEE) discount = Math.min(discount, 0.7);
  const highValueOpened = openedValues.filter((value) => value >= ENTRY_FEE).length;
  if (highValueOpened >= 2) discount *= 0.8;
  const lowOpenedBoost = Math.max(0, 1 - averageOpened / MAX_JACKPOT) * 0.03;
  return Math.min(MAX_JACKPOT, Math.max(0, averageRemaining * (discount + lowOpenedBoost)));
}

function showOffer() {
  if (offerPending || !active) return;
  offerPending = true;
  currentOffer = Math.round(calculateOffer() / 10) * 10;
  $('modalOffer').textContent = money(currentOffer);
  $('modalReason').textContent = '资本家正在根据剩余金额折价思考报价，报价通常低于剩余箱子的数学期望。';
  $('dealModal').classList.remove('hidden');
  $('noDealBtn').disabled = true;
  $('dealBtn').disabled = true;
  $('timer').textContent = '思考中';
  bankerThinkId = setTimeout(() => {
    if (!$('dealModal').classList.contains('hidden')) {
      $('modalReason').textContent = consecutiveNoDeals > 0
        ? `连续 ${consecutiveNoDeals} 次 NO DEAL，资本家进一步压低报价。`
        : '报价低于剩余箱子的数学期望，是否现在止盈离场？';
      $('noDealBtn').disabled = false;
      $('dealBtn').disabled = false;
      startTimer();
    }
  }, BANKER_THINK_SECONDS * 1000);
}

function startTimer() {
  let seconds = THINK_SECONDS;
  $('timer').textContent = `01:00`;
  clearInterval(timerId);
  timerId = setInterval(() => {
    seconds -= 1;
    $('timer').textContent = `00:${String(seconds).padStart(2, '0')}`;
    if (seconds <= 0) {
      clearInterval(timerId);
      noDeal();
    }
  }, 1000);
}

function noDeal() {
  clearInterval(timerId);
  clearTimeout(bankerThinkId);
  offerPending = false;
  $('dealModal').classList.add('hidden');
  consecutiveNoDeals += 1;
  if (active && totalOpenedCount < CASE_VALUES.length - 1) {
    openedCount = 0;
    roundIndex = Math.min(roundIndex + 1, ROUND_PLAN.length - 1);
    updateStats();
    showMessage('NO DEAL！准备进入下一轮。');
    showRoundPrompt();
  }
}

function beginRound() {
  $('roundModal').classList.add('hidden');
  roundModalPending = false;
  showMessage(`第 ${getRoundIndex() + 1} 轮开始，请选择 ${getRoundTarget()} 个箱子。`);
  updateStats();
}

function acceptDeal() {
  clearInterval(timerId);
  clearTimeout(bankerThinkId);
  offerPending = false;
  $('dealModal').classList.add('hidden');
  balance += currentOffer + groupBonus;
  active = false;
  saveCurrentPlayer();
  $('startBtn').disabled = false;
  $('startBtn').style.opacity = '1';
  $('resultTitle').textContent = currentOffer + groupBonus > ENTRY_FEE ? 'DEAL！盈利离场' : currentOffer + groupBonus === ENTRY_FEE ? 'DEAL！保本离场' : 'DEAL！亏损离场';
  const dealTotal = currentOffer + groupBonus;
  const dealNet = dealTotal - ENTRY_FEE;
  $('resultText').textContent = `报价 ${money(currentOffer)} + 组奖励 ${money(groupBonus)} = 带走 ${money(dealTotal)}。${dealNet >= 0 ? '净收益' : '净亏损'} ${money(Math.abs(dealNet))}，${dealNet >= 0 ? '未亏损' : '本局亏损'}。`;
  $('resultModal').classList.remove('hidden');
  updateStats();
  renderScoreboard();
}

function finishGame() {
  const finalTotal = playerCase + groupBonus;
  balance += finalTotal;
  const finalNet = finalTotal - ENTRY_FEE;
  saveCurrentPlayer();
  $('startBtn').disabled = false;
  $('startBtn').style.opacity = '1';
  $('resultTitle').textContent = finalNet > 0 ? '最终开箱 · 盈利离场' : finalNet === 0 ? '最终开箱 · 保本离场' : '最终开箱 · 亏损离场';
  $('resultText').textContent = `你的箱子是 ${money(playerCase)}，组奖励 ${money(groupBonus)}，本局带走 ${money(finalTotal)}。${finalNet >= 0 ? '净收益' : '净亏损'} ${money(Math.abs(finalNet))}。`;
  $('resultModal').classList.remove('hidden');
  updateStats();
  renderScoreboard();
}

function showMessage(text, type = '') {
  $('message').textContent = text;
  $('message').className = `message ${type}`;
}

function reset() {
  clearInterval(timerId);
  clearTimeout(bankerThinkId);
  balance = INITIAL_BALANCE;
  active = false;
  currentPlayerName = '';
  players.clear();
  playerCase = null;
  remainingValues = [];
  caseValues = [];
  openedValues = [];
  totalOpenedCount = 0;
  currentOffer = 0;
  groupBonus = 0;
  openedCount = 0;
  consecutiveNoDeals = 0;
  roundIndex = 0;
  bonusQueue = [];
  bonusShowing = false;
  offerPending = false;
  unlockedGroups = new Set();
  $('roundModal').classList.add('hidden');
  $('bonusModal').classList.add('hidden');
  $('dealModal').classList.add('hidden');
  $('loginModal').classList.remove('hidden');
  $('startBtn').disabled = false;
  $('startBtn').style.opacity = '1';
  updateStats();
  renderCases();
  renderScoreboard();
  showMessage('准备好了吗？输入用户名后开始比赛。');
}

$('startBtn').addEventListener('click', () => {
  if (!active) {
    $('loginModal').classList.remove('hidden');
    $('playerNameInput').focus();
  }
});
$('loginBtn').addEventListener('click', loginPlayer);
$('resetBtn').addEventListener('click', reset);
$('noDealBtn').addEventListener('click', noDeal);
$('dealBtn').addEventListener('click', acceptDeal);
$('bonusBtn').addEventListener('click', () => {
  $('bonusModal').classList.add('hidden');
  bonusShowing = false;
  if (bonusQueue.length > 0) {
    showNextBonus();
  } else if (active && getRoundOpenedCount() >= getRoundTarget()) {
    showOffer();
  } else if (active) {
    showMessage(`组奖励已领取，继续选择本轮剩余的 ${getRoundTarget() - getRoundOpenedCount()} 个箱子。`, 'win');
  }
});
$('roundModalBtn').addEventListener('click', beginRound);
$('resultBtn').addEventListener('click', switchPlayer);
renderPrizeBoard();
renderScoreboard();
updateStats();
renderCases();
