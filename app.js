const STORAGE_KEYS = {
  wordLists: 'spellingLabWordLists',
  profiles: 'spellingLabProfiles',
  voiceName: 'spellingLabVoiceName'
};

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'password123';
const SUBMISSION_DELAY_MS = 800;

const appState = {
  wordLists: {},
  currentMode: 'home',
  activeStudent: '',
  activeClass: '',
  adminLoggedIn: false,
  selectedAdminClass: '',
  availableVoices: [],
  selectedVoiceName: localStorage.getItem(STORAGE_KEYS.voiceName) || '',
  currentTestNumber: 1,
  currentTestKey: '',
  isSubmitting: false,
  adminPreviousScreen: 'home',
  practiceReturnScreen: 'home',
  practiceReturnLabel: '⬅ Back Home',
  sessionHistory: [],
  currentSession: createEmptySession()
};

function createEmptySession() {
  return {
    words: [],
    originalWords: [],
    currentIndex: 0,
    currentWord: '',
    answers: [],
    correct: [],
    incorrect: [],
    total: 0,
    completed: false,
    sourceLabel: '',
    mode: 'test',
    testNumber: 1,
    className: '',
    studentName: '',
    requestedCount: 10
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadWords();
  populateClassSelects();
  bindHomeEvents();
  attachTestInputHandler();
  initialiseVoices();
  updateHomeSummary();

  if (document.getElementById('adminLogin')) {
    resetAdminLogin();
  }
});

function bindHomeEvents() {
  ['studentName', 'classSelect', 'testSizeSelect'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('input', () => {
        resetTestSeriesIfNeeded();
        updateHomeSummary();
      });
      element.addEventListener('change', () => {
        resetTestSeriesIfNeeded();
        updateHomeSummary();
      });
    }
  });

  const voiceSelect = document.getElementById('voiceSelect');
  if (voiceSelect) {
    voiceSelect.addEventListener('change', event => {
      appState.selectedVoiceName = event.target.value;
      localStorage.setItem(STORAGE_KEYS.voiceName, appState.selectedVoiceName);
      updateActiveVoiceLabel();
    });
  }
}

function attachTestInputHandler() {
  const answerInput = document.getElementById('answer');
  if (!answerInput) return;

  answerInput.addEventListener('input', handleAnswerInputValidation);
  answerInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitAnswer();
    }
  });
}

function handleAnswerInputValidation(event) {
  const originalValue = event.target.value;
  const sanitisedValue = originalValue.replace(/[^a-zA-Z]/g, '');
  if (originalValue !== sanitisedValue) {
    event.target.value = sanitisedValue;
    showTestMessage('Only letters A–Z are allowed. Numbers and symbols have been removed.');
  }
}

function loadWords() {
  const storedWords = localStorage.getItem(STORAGE_KEYS.wordLists);
  if (storedWords) {
    appState.wordLists = JSON.parse(storedWords);
    return Promise.resolve(appState.wordLists);
  }

  return fetch('words.json')
    .then(response => response.json())
    .then(data => {
      appState.wordLists = data;
      return data;
    })
    .catch(error => {
      console.error('Error loading words:', error);
      appState.wordLists = {};
      return {};
    });
}

function saveWordListsToStorage() {
  localStorage.setItem(STORAGE_KEYS.wordLists, JSON.stringify(appState.wordLists));
}

function initialiseVoices() {
  populateVoiceSelect();
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.onvoiceschanged = () => populateVoiceSelect();
  }
}

function populateVoiceSelect() {
  const voiceSelect = document.getElementById('voiceSelect');
  if (!voiceSelect || typeof speechSynthesis === 'undefined') return;

  const voices = speechSynthesis.getVoices().filter(voice => voice.lang?.toLowerCase().startsWith('en'));
  appState.availableVoices = voices.length ? voices : speechSynthesis.getVoices();

  voiceSelect.innerHTML = '';

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Browser Default Voice';
  voiceSelect.appendChild(defaultOption);

  appState.availableVoices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  const hasSavedVoice = appState.availableVoices.some(voice => voice.name === appState.selectedVoiceName);
  if (!hasSavedVoice) {
    appState.selectedVoiceName = '';
    localStorage.removeItem(STORAGE_KEYS.voiceName);
  }

  voiceSelect.value = appState.selectedVoiceName;
  updateActiveVoiceLabel();
}

function updateActiveVoiceLabel() {
  const activeVoiceLabel = document.getElementById('activeVoiceLabel');
  if (!activeVoiceLabel) return;
  activeVoiceLabel.textContent = `Voice: ${appState.selectedVoiceName || 'Default'}`;
}

function populateClassSelects() {
  const classes = Object.keys(appState.wordLists).sort();
  populateSelect('classSelect', classes);
  populateSelect('classSelectAdmin', classes);
}

function populateSelect(selectId, classes) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const previousValue = select.value;
  select.innerHTML = '';

  classes.forEach(className => {
    const option = document.createElement('option');
    option.value = className;
    option.textContent = className;
    select.appendChild(option);
  });

  if (classes.includes(previousValue)) {
    select.value = previousValue;
  }
}

function showScreen(screenId) {
  ['home', 'practice', 'test', 'results', 'admin'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.classList.toggle('hidden', id !== screenId);
    }
  });
  appState.currentMode = screenId;
}

function getSelectedStudent() {
  const input = document.getElementById('studentName');
  const value = input ? input.value.trim() : '';
  return value || 'Guest';
}

function normaliseStudentKey(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getSelectedClass() {
  const select = document.getElementById('classSelect');
  return select ? select.value : '';
}

function getRequestedTestSize() {
  const select = document.getElementById('testSizeSelect');
  if (!select || select.value === 'all') return 'all';
  return Number(select.value);
}

function getProfiles() {
  const storedProfiles = localStorage.getItem(STORAGE_KEYS.profiles);
  return storedProfiles ? JSON.parse(storedProfiles) : { students: {} };
}

function saveProfiles(profiles) {
  localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));
}

function getStudentClassProfile(studentName, className) {
  const profiles = getProfiles();
  const studentKey = normaliseStudentKey(studentName);

  if (!profiles.students[studentKey]) {
    profiles.students[studentKey] = {
      displayName: studentName,
      classes: {}
    };
  }

  if (!profiles.students[studentKey].classes[className]) {
    profiles.students[studentKey].classes[className] = {
      wordStats: {},
      recentTests: []
    };
  }

  return {
    profiles,
    studentKey,
    classProfile: profiles.students[studentKey].classes[className]
  };
}

function dedupeWords(words) {
  return [...new Set((words || []).map(word => String(word).trim()).filter(Boolean))];
}

function getClassWords(className) {
  return dedupeWords(appState.wordLists[className] || []);
}

function shuffleArray(items) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getCurrentTestKey(studentName = getSelectedStudent(), className = getSelectedClass()) {
  return `${normaliseStudentKey(studentName)}::${className}`;
}

function ensureTestSeries(studentName, className, preserveSeries = false) {
  const nextKey = getCurrentTestKey(studentName, className);
  if (!preserveSeries || appState.currentTestKey !== nextKey) {
    appState.currentTestKey = nextKey;
    appState.currentTestNumber = 1;
    appState.sessionHistory = [];
  }
}

function resetTestSeriesIfNeeded() {
  const key = getCurrentTestKey();
  if (appState.currentTestKey && appState.currentTestKey !== key) {
    appState.currentTestNumber = 1;
    appState.currentTestKey = '';
    appState.sessionHistory = [];
  }
}

function buildAdaptiveWordPool(allWords, requestedCount, studentName, className, options = {}) {
  const uniqueWords = dedupeWords(allWords);
  const exclude = new Set(dedupeWords(options.excludeWords || []));
  const filteredWords = uniqueWords.filter(word => !exclude.has(word));
  const workingWords = filteredWords.length ? filteredWords : uniqueWords;

  if (workingWords.length === 0) return [];

  if (requestedCount === 'all') {
    return shuffleArray(workingWords);
  }

  const { classProfile } = getStudentClassProfile(studentName, className);

  const rankedWords = workingWords
    .map(word => {
      const stats = classProfile.wordStats[word] || { correct: 0, incorrect: 0, lastSeen: 0 };
      const unseen = stats.correct === 0 && stats.incorrect === 0;
      const recentPenalty = stats.correct >= 2 && stats.lastSeen > 0 ? 8 : 0;
      const struggleBonus = stats.incorrect * 5;
      const confidencePenalty = stats.correct * 2;
      const priority = unseen ? 100 : struggleBonus - confidencePenalty - recentPenalty;

      return {
        word,
        priority,
        randomTieBreaker: Math.random()
      };
    })
    .sort((a, b) => (b.priority - a.priority) || (a.randomTieBreaker - b.randomTieBreaker))
    .map(entry => entry.word);

  return rankedWords.slice(0, Math.min(requestedCount, rankedWords.length));
}

function setPracticeBackTarget(screenId = 'home', label = '⬅ Back Home') {
  appState.practiceReturnScreen = screenId;
  appState.practiceReturnLabel = label;
  const button = document.getElementById('practiceBackButton');
  if (button) {
    button.textContent = label;
  }
}

function startPractice(customWords = null, options = {}) {
  const className = options.className || getSelectedClass();
  const studentName = options.studentName || getSelectedStudent();
  const requestedCount = options.requestedCount || getRequestedTestSize();
  const generatedWords = customWords ? dedupeWords(customWords) : getClassWords(className);
  const words = options.onlyFresh
    ? buildAdaptiveWordPool(getClassWords(className), requestedCount, studentName, className, { excludeWords: options.excludeWords || [] })
    : generatedWords;
  const sortedWords = [...words].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  
  const title = options.title || `${className || 'Class'} Practice`;
  const subtitle = options.subtitle || 'Review and listen to words as many times as needed.';
  const practiceInfo = document.getElementById('practiceInfo');
  const practiceTitle = document.getElementById('practiceTitle');
  const practiceSubtitle = document.getElementById('practiceSubtitle');
  const wordList = document.getElementById('wordList');

  setPracticeBackTarget(options.returnScreen || 'home', options.returnLabel || '⬅ Back Home');

  if (practiceInfo) {
    practiceInfo.textContent = options.infoText || 'Practice is untracked and does not affect test counters.';
  }
  if (practiceTitle) practiceTitle.textContent = title;
  if (practiceSubtitle) practiceSubtitle.textContent = subtitle;

  if (wordList) {
    if (!words.length) {
      wordList.innerHTML = '<div class="chip empty">No words available for this practice set.</div>';
    } else {
      wordList.innerHTML = renderPracticeGroups(sortedWords);
     }
  }

  showScreen('practice');
}

function renderPracticeGroups(words) {
  const groupedWords = words.reduce((groups, word) => {
    const initial = /^[a-z]/i.test(word)
      ? word.charAt(0).toUpperCase()
      : '#';

    if (!groups[initial]) {
      groups[initial] = [];
    }

    groups[initial].push(word);
    return groups;
  }, {});

  return Object.keys(groupedWords)
    .sort((a, b) => a.localeCompare(b))
    .map((letter, index) => {
      const items = groupedWords[letter]
        .map(
          (word) => `
            <li class="word-item">
              <span>${word}</span>
              <button onclick='speak(${JSON.stringify(word)})'>
                🔊 Speak
              </button>
            </li>
          `
        )
        .join('');

      return `
        <details class="practice-group" ${index === 0 ? 'open' : ''}>
          <summary class="practice-group-summary">
            <span class="practice-group-letter">${letter}</span>
          </summary>

          <ul class="word-list practice-group-list">
            ${items}
          </ul>
        </details>
      `;
    })
    .join('');
}

function startTest(customWords = null, options = {}) {
  const className = options.className || getSelectedClass();
  const studentName = options.studentName || getSelectedStudent();
  const allWords = getClassWords(className);

  if (!className || allWords.length === 0) {
    alert('Please choose a class with available words.');
    return;
  }

  ensureTestSeries(studentName, className, options.preserveSeries === true);
  if (options.incrementTestNumber === true) {
    appState.currentTestNumber += 1;
  }

  const requestedCount = customWords ? customWords.length : (options.requestedCount || getRequestedTestSize());
  const testWords = customWords
    ? dedupeWords(customWords)
    : buildAdaptiveWordPool(allWords, requestedCount, studentName, className, {
        excludeWords: options.excludeWords || []
      });

  if (!testWords.length) {
    alert('No test words are available for this selection.');
    return;
  }

  appState.activeStudent = studentName;
  appState.activeClass = className;
  appState.isSubmitting = false;
  appState.currentSession = {
    words: [...testWords],
    originalWords: [...testWords],
    currentIndex: 0,
    currentWord: testWords[0],
    answers: [],
    correct: [],
    incorrect: [],
    total: testWords.length,
    completed: false,
    sourceLabel: options.sourceLabel || `Test ${appState.currentTestNumber}`,
    mode: 'test',
    testNumber: appState.currentTestNumber,
    className,
    studentName,
    requestedCount
  };

  clearTestMessage();
  hideSubmissionIndicator();
  updateActiveVoiceLabel();
  showScreen('test');
  renderCurrentTestWord();
}

function renderCurrentTestWord() {
  const { currentSession } = appState;

  if (!currentSession.words.length || currentSession.currentIndex >= currentSession.words.length) {
    completeTest();
    return;
  }

  currentSession.currentWord = currentSession.words[currentSession.currentIndex];

  const progress = document.getElementById('testProgress');
  const wordDisplay = document.getElementById('wordDisplay');
  const answer = document.getElementById('answer');
  const testSeriesBadge = document.getElementById('testSeriesBadge');
  const submitButton = document.getElementById('submitAnswerButton');

  if (testSeriesBadge) {
    testSeriesBadge.textContent = `Test ${currentSession.testNumber}`;
  }
  if (progress) {
    progress.textContent = `Word ${currentSession.currentIndex + 1} of ${currentSession.total}`;
  }
  if (wordDisplay) {
    wordDisplay.textContent = 'Tap speak to hear the word';
  }
  if (answer) {
    answer.value = '';
    answer.focus();
  }
  if (submitButton) {
    submitButton.disabled = false;
  }

  clearTestMessage();
  hideSubmissionIndicator();
}

function clearTestMessage() {
  const testMessage = document.getElementById('testMessage');
  if (testMessage) {
    testMessage.textContent = '';
  }
}

function showTestMessage(message) {
  const testMessage = document.getElementById('testMessage');
  if (testMessage) {
    testMessage.textContent = message;
  }
}

function showSubmissionIndicator(message = '✅ Answer submitted') {
  const indicator = document.getElementById('submissionIndicator');
  if (!indicator) return;
  indicator.textContent = message;
  indicator.classList.remove('hidden');
  indicator.classList.add('show');
}

function hideSubmissionIndicator() {
  const indicator = document.getElementById('submissionIndicator');
  if (!indicator) return;
  indicator.classList.add('hidden');
  indicator.classList.remove('show');
}

function getSelectedVoice() {
  if (!appState.selectedVoiceName) return null;
  return appState.availableVoices.find(voice => voice.name === appState.selectedVoiceName) || null;
}

function speak(word) {
  const utterance = new SpeechSynthesisUtterance(word);
  const selectedVoice = getSelectedVoice();
  utterance.rate = 0.8;
  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function speakWord() {
  if (appState.currentSession.currentWord) {
    speak(appState.currentSession.currentWord);
  }
}

function validateAnswer(userAnswer, currentWord) {
  if (!userAnswer) {
    return 'Please type an answer before moving on.';
  }
  if (!/^[a-zA-Z]+$/.test(userAnswer)) {
    return 'Answers must contain letters only.';
  }
  if (userAnswer.length === 1 && currentWord.length > 1) {
    return 'Single-letter answers are not allowed for this word.';
  }
  return '';
}

function submitAnswer() {
  if (appState.isSubmitting) return;

  const answerInput = document.getElementById('answer');
  const submitButton = document.getElementById('submitAnswerButton');
  const rawAnswer = answerInput ? answerInput.value.trim() : '';
  const validationMessage = validateAnswer(rawAnswer, appState.currentSession.currentWord || '');

  if (validationMessage) {
    showTestMessage(validationMessage);
    return;
  }

  const userAnswer = rawAnswer.toLowerCase();
  const currentWord = appState.currentSession.currentWord;
  const isCorrect = userAnswer === currentWord.toLowerCase();
  const answerRecord = {
    word: currentWord,
    userAnswer,
    isCorrect
  };

  appState.currentSession.answers.push(answerRecord);

  if (isCorrect) {
    appState.currentSession.correct.push(currentWord);
  } else {
    appState.currentSession.incorrect.push(currentWord);
  }

  updateWordHistory(appState.activeStudent, appState.activeClass, currentWord, isCorrect);

  appState.isSubmitting = true;
  if (submitButton) {
    submitButton.disabled = true;
  }
  showSubmissionIndicator(isCorrect ? '✅ Submitted' : '✅ Submitted — moving to next word');
  clearTestMessage();

  window.setTimeout(() => {
    appState.currentSession.currentIndex += 1;
    appState.isSubmitting = false;

    if (appState.currentSession.currentIndex >= appState.currentSession.total) {
      completeTest();
      return;
    }

    renderCurrentTestWord();
  }, SUBMISSION_DELAY_MS);
}

function updateWordHistory(studentName, className, word, isCorrect) {
  const { profiles, classProfile } = getStudentClassProfile(studentName, className);

  if (!classProfile.wordStats[word]) {
    classProfile.wordStats[word] = {
      correct: 0,
      incorrect: 0,
      lastSeen: 0
    };
  }

  if (isCorrect) {
    classProfile.wordStats[word].correct += 1;
  } else {
    classProfile.wordStats[word].incorrect += 1;
  }
  classProfile.wordStats[word].lastSeen = Date.now();

  saveProfiles(profiles);
}

function completeTest() {
  const session = appState.currentSession;
  if (session.completed) return;

  session.completed = true;
  hideSubmissionIndicator();
  saveRecentTest();
  addSessionHistoryEntry(session);
  renderResults();
  updateHomeSummary();
  showScreen('results');
}

function saveRecentTest() {
  const session = appState.currentSession;
  const { profiles, classProfile } = getStudentClassProfile(appState.activeStudent, appState.activeClass);

  classProfile.recentTests.unshift({
    date: Date.now(),
    total: session.total,
    testNumber: session.testNumber,
    score: session.correct.length,
    correct: [...session.correct],
    incorrect: [...session.incorrect],
    words: [...session.originalWords],
    answers: session.answers.map(answer => ({ ...answer }))
  });

  classProfile.recentTests = classProfile.recentTests.slice(0, 10);
  saveProfiles(profiles);
}

function addSessionHistoryEntry(session) {
  appState.sessionHistory = appState.sessionHistory.filter(entry => entry.testNumber !== session.testNumber);
  appState.sessionHistory.push({
    testNumber: session.testNumber,
    score: session.correct.length,
    total: session.total,
    missedCount: session.incorrect.length
  });
  appState.sessionHistory.sort((a, b) => a.testNumber - b.testNumber);
}

function renderResults() {
  const session = appState.currentSession;
  const correctCount = session.correct.length;
  const total = session.total;
  const percent = total ? Math.round((correctCount / total) * 100) : 0;

  const resultScore = document.getElementById('resultScore');
  const resultSummary = document.getElementById('resultSummary');
  const resultsBadge = document.getElementById('resultsTestSeriesBadge');

  if (resultsBadge) {
    resultsBadge.textContent = `Test ${session.testNumber} Complete`;
  }
  if (resultScore) {
    resultScore.textContent = `${correctCount} / ${total}`;
  }
  if (resultSummary) {
    resultSummary.textContent = `${session.studentName} completed Test ${session.testNumber} with ${correctCount} out of ${total} correct (${percent}%).`;
  }

  renderChipList('correctWordsList', session.correct, 'correct', 'No correct words yet');
  renderChipList('missedWordsList', session.incorrect, 'missed', 'No missed words — great job!');
  renderDetailedResults();
  renderSessionHistory();
}

function renderChipList(containerId, words, variant, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!words.length) {
    container.innerHTML = `<span class="chip empty">${emptyText}</span>`;
    return;
  }

  container.innerHTML = words.map(word => `<span class="chip ${variant}">${word}</span>`).join('');
}

function renderDetailedResults() {
  const body = document.getElementById('detailedResultsBody');
  if (!body) return;

  if (!appState.currentSession.answers.length) {
    body.innerHTML = '<tr><td colspan="3">No answers recorded yet.</td></tr>';
    return;
  }

  body.innerHTML = appState.currentSession.answers.map(answer => `
    <tr>
      <td>${answer.word}</td>
      <td>${answer.userAnswer}</td>
      <td class="${answer.isCorrect ? 'status-correct' : 'status-missed'}">${answer.isCorrect ? 'Correct' : `Missed · Correct: ${answer.word}`}</td>
    </tr>
  `).join('');
}

function renderSessionHistory() {
  const list = document.getElementById('sessionHistoryList');
  if (!list) return;

  if (!appState.sessionHistory.length) {
    list.innerHTML = '<div class="session-history-item">No completed tests in this session yet.</div>';
    return;
  }

  list.innerHTML = appState.sessionHistory.map(entry => `
    <div class="session-history-item">
      <strong>Test ${entry.testNumber}</strong> · Score ${entry.score}/${entry.total} · Missed ${entry.missedCount}
    </div>
  `).join('');
}

function retrySameTest() {
  if (!appState.currentSession.originalWords.length) {
    goHome();
    return;
  }

  appState.currentTestNumber = appState.currentSession.testNumber;
  startTest(appState.currentSession.originalWords, {
    preserveSeries: true,
    sourceLabel: `Test ${appState.currentSession.testNumber}`,
    className: appState.currentSession.className,
    studentName: appState.currentSession.studentName,
    requestedCount: appState.currentSession.requestedCount
  });
}

function practiceMissedWords() {
  if (!appState.currentSession.incorrect.length) {
    alert('There are no missed words to practice from this test.');
    return;
  }

  startPractice(appState.currentSession.incorrect, {
    title: 'Practice Missed Words',
    subtitle: 'Review the words missed in the last test, then return to the same results page.',
    className: appState.currentSession.className,
    studentName: appState.currentSession.studentName,
    returnScreen: 'results',
    returnLabel: '⬅ Back to Results'
  });
}

function practiceNewSetOfWords() {
  const session = appState.currentSession;
  startPractice(null, {
    title: 'Practice New Set of Words',
    subtitle: 'Here is a fresh untracked practice batch before the next test.',
    onlyFresh: true,
    excludeWords: session.originalWords,
    requestedCount: session.requestedCount,
    className: session.className,
    studentName: session.studentName,
    returnScreen: 'results',
    returnLabel: '⬅ Back to Results'
  });
}

function startNextTest() {
  const session = appState.currentSession;
  startTest(null, {
    preserveSeries: true,
    incrementTestNumber: true,
    className: session.className,
    studentName: session.studentName,
    requestedCount: session.requestedCount,
    excludeWords: session.originalWords
  });
}

function backFromPractice() {
  if (appState.practiceReturnScreen === 'results') {
    renderResults();
    showScreen('results');
    return;
  }
  goHome();
}

function updateHomeSummary() {
  const summary = document.getElementById('homeSummary');
  if (!summary) return;

  const className = getSelectedClass();
  const studentName = getSelectedStudent();
  const totalWords = getClassWords(className).length;

  if (!className) {
    summary.innerHTML = '<div class="summary-title">Ready to start</div><p>Select a class to begin.</p>';
    return;
  }

  const { classProfile } = getStudentClassProfile(studentName, className);
  const attemptedWords = Object.keys(classProfile.wordStats).length;
  const missedWords = Object.values(classProfile.wordStats).filter(stats => stats.incorrect > 0).length;
  const recentTests = classProfile.recentTests.length;

  summary.innerHTML = `
    <div class="summary-title">${studentName} · ${className}</div>
    <p>${totalWords} words available · ${attemptedWords} words attempted · ${missedWords} with mistakes · ${recentTests} recent tests</p>
  `;
}

function resetSessionFlow() {
  appState.currentTestNumber = 1;
  appState.currentTestKey = '';
  appState.sessionHistory = [];
  appState.currentSession = createEmptySession();
  setPracticeBackTarget('home', '⬅ Back Home');
}

function goHome() {
  clearTestMessage();
  hideSubmissionIndicator();
  resetSessionFlow();
  showScreen('home');
  updateActiveVoiceLabel();
  updateHomeSummary();
}

function openAdmin() {
  appState.adminPreviousScreen = appState.currentMode === 'admin' ? 'home' : appState.currentMode;
  resetAdminLogin();
  showScreen('admin');
}

function closeAdmin() {
  const target = appState.adminPreviousScreen || 'home';
  showScreen(target);
  if (target === 'results') {
    renderResults();
  } else if (target === 'practice') {
    // leave current practice screen content as-is
  } else {
    updateHomeSummary();
  }
}

function resetAdminLogin() {
  appState.adminLoggedIn = false;
  appState.selectedAdminClass = '';

  const loginSection = document.getElementById('adminLogin');
  const dashboardSection = document.getElementById('adminDashboard');
  const loginError = document.getElementById('adminLoginError');

  if (loginSection) loginSection.classList.remove('hidden');
  if (dashboardSection) dashboardSection.classList.add('hidden');
  if (loginError) loginError.textContent = '';

  const username = document.getElementById('adminUsername');
  const password = document.getElementById('adminPassword');
  if (username) username.value = '';
  if (password) password.value = '';
}

function loginAdmin() {
  const username = document.getElementById('adminUsername')?.value.trim() || '';
  const password = document.getElementById('adminPassword')?.value || '';
  const loginError = document.getElementById('adminLoginError');

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    appState.adminLoggedIn = true;
    if (loginError) loginError.textContent = '';
    document.getElementById('adminLogin')?.classList.add('hidden');
    document.getElementById('adminDashboard')?.classList.remove('hidden');
    setupAdminClasses();
  } else if (loginError) {
    loginError.textContent = 'Invalid username or password.';
  }
}

function setupAdminClasses() {
  const classes = Object.keys(appState.wordLists).sort();
  populateSelect('classSelectAdmin', classes);

  const select = document.getElementById('classSelectAdmin');
  appState.selectedAdminClass = select?.value || classes[0] || '';
  loadAdminClass();
}

function loadAdminClass() {
  const select = document.getElementById('classSelectAdmin');
  const editor = document.getElementById('wordsEditor');
  if (!select || !editor) return;

  appState.selectedAdminClass = select.value;
  editor.value = (appState.wordLists[appState.selectedAdminClass] || []).join(', ');
}

function addAdminClass() {
  const input = document.getElementById('newClassName');
  const className = input?.value.trim();

  if (!className) {
    alert('Enter a valid class name.');
    return;
  }

  if (appState.wordLists[className]) {
    alert('Class already exists. Choose another name.');
    return;
  }

  appState.wordLists[className] = [];
  appState.selectedAdminClass = className;
  if (input) input.value = '';

  saveWordListsToStorage();
  populateClassSelects();
  setupAdminClasses();
  const adminSelect = document.getElementById('classSelectAdmin');
  if (adminSelect) adminSelect.value = className;
  loadAdminClass();
  updateHomeSummary();
  alert(`New class ${className} added.`);
}

function logoutAdmin() {
  resetAdminLogin();
  showScreen('admin');
}

function saveWords() {
  if (!appState.adminLoggedIn) {
    alert('Please log in to save admin changes.');
    return;
  }

  const editor = document.getElementById('wordsEditor');
  if (!editor || !appState.selectedAdminClass) return;

  appState.wordLists[appState.selectedAdminClass] = dedupeWords(editor.value.split(','));
  saveWordListsToStorage();
  populateClassSelects();
  updateHomeSummary();
  alert('Words saved successfully on this device.');
}
