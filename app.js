const STORAGE_KEYS = {
  wordLists: 'spellingLabWordLists',
  profiles: 'spellingLabProfiles'
};

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'password123';

const appState = {
  wordLists: {},
  currentMode: 'home',
  activeStudent: '',
  activeClass: '',
  adminLoggedIn: false,
  selectedAdminClass: '',
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
    sourceLabel: ''
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadWords();
  populateClassSelects();
  bindHomeEvents();
  attachTestInputHandler();
  updateHomeSummary();

  if (document.getElementById('adminLogin')) {
    resetAdminLogin();
  }
});

function bindHomeEvents() {
  ['studentName', 'classSelect', 'testSizeSelect'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('input', updateHomeSummary);
      element.addEventListener('change', updateHomeSummary);
    }
  });
}

function attachTestInputHandler() {
  const answerInput = document.getElementById('answer');
  if (!answerInput) return;

  answerInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitAnswer();
    }
  });
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

function populateClassSelects() {
  const classes = Object.keys(appState.wordLists).sort();
  populateSelect('classSelect', classes);
  populateSelect('classSelectAdmin', classes);
  populateSelect('manageClassSelect', classes);
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

function buildAdaptiveWordPool(allWords, requestedCount, studentName, className) {
  const uniqueWords = dedupeWords(allWords);
  if (uniqueWords.length === 0) return [];

  if (requestedCount === 'all') {
    return shuffleArray(uniqueWords);
  }

  const { classProfile } = getStudentClassProfile(studentName, className);

  const rankedWords = uniqueWords
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

function startPractice(customWords = null, options = {}) {
  const className = getSelectedClass();
  const words = customWords ? dedupeWords(customWords) : getClassWords(className);
  const title = options.title || `${className || 'Class'} Practice`;
  const subtitle = options.subtitle || 'Review the words and listen as many times as needed.';

  const practiceTitle = document.getElementById('practiceTitle');
  const practiceSubtitle = document.getElementById('practiceSubtitle');
  const wordList = document.getElementById('wordList');

  if (practiceTitle) practiceTitle.textContent = title;
  if (practiceSubtitle) practiceSubtitle.textContent = subtitle;

  if (wordList) {
    if (!words.length) {
      wordList.innerHTML = '<div class="chip empty">No words available for this practice set.</div>';
    } else {
      const items = words.map(word => `
        <li class="word-item">
          <span>${word}</span>
          <button onclick='speak(${JSON.stringify(word)})'>🔊 Speak</button>
        </li>
      `).join('');

      wordList.innerHTML = `<ul class="word-list">${items}</ul>`;
    }
  }

  showScreen('practice');
}

function startTest(customWords = null, options = {}) {
  const className = getSelectedClass();
  const studentName = getSelectedStudent();
  const allWords = getClassWords(className);

  if (!className || allWords.length === 0) {
    alert('Please choose a class with available words.');
    return;
  }

  const requestedCount = customWords ? customWords.length : getRequestedTestSize();
  const testWords = customWords
    ? dedupeWords(customWords)
    : buildAdaptiveWordPool(allWords, requestedCount, studentName, className);

  if (!testWords.length) {
    alert('No test words are available for this selection.');
    return;
  }

  appState.activeStudent = studentName;
  appState.activeClass = className;
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
    sourceLabel: options.sourceLabel || 'Adaptive Test'
  };

  clearTestMessage();
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

  clearTestMessage();
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

function speak(word) {
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.rate = 0.8;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function speakWord() {
  if (appState.currentSession.currentWord) {
    speak(appState.currentSession.currentWord);
  }
}

function submitAnswer() {
  const answerInput = document.getElementById('answer');
  const userAnswer = answerInput ? answerInput.value.trim().toLowerCase() : '';
  const currentWord = appState.currentSession.currentWord;

  if (!currentWord) return;

  if (!userAnswer) {
    showTestMessage('Please type an answer before moving on.');
    return;
  }

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

  appState.currentSession.currentIndex += 1;

  if (appState.currentSession.currentIndex >= appState.currentSession.total) {
    completeTest();
    return;
  }

  renderCurrentTestWord();
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
  saveRecentTest();
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
    correct: [...session.correct],
    incorrect: [...session.incorrect],
    words: [...session.originalWords]
  });

  classProfile.recentTests = classProfile.recentTests.slice(0, 10);
  saveProfiles(profiles);
}

function renderResults() {
  const session = appState.currentSession;
  const correctCount = session.correct.length;
  const total = session.total;
  const percent = total ? Math.round((correctCount / total) * 100) : 0;

  const resultScore = document.getElementById('resultScore');
  const resultSummary = document.getElementById('resultSummary');

  if (resultScore) {
    resultScore.textContent = `${correctCount} / ${total}`;
  }
  if (resultSummary) {
    resultSummary.textContent = `${appState.activeStudent} scored ${correctCount} out of ${total} (${percent}%).`;
  }

  renderChipList('correctWordsList', session.correct, 'correct', 'No correct words yet');
  renderChipList('missedWordsList', session.incorrect, 'missed', 'No missed words — great job!');
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

function retrySameTest() {
  if (!appState.currentSession.originalWords.length) {
    goHome();
    return;
  }

  startTest(appState.currentSession.originalWords, { sourceLabel: 'Retry Test' });
}

function practiceMissedWords() {
  if (!appState.currentSession.incorrect.length) {
    alert('There are no missed words to practice from this test.');
    return;
  }

  startPractice(appState.currentSession.incorrect, {
    title: 'Practice Missed Words',
    subtitle: 'Focus on the words missed in the last test.'
  });
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

function goHome() {
  clearTestMessage();
  showScreen('home');
  updateHomeSummary();
}

function openAdmin() {
  resetAdminLogin();
  showScreen('admin');
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
  populateSelect('manageClassSelect', classes);

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

function renameClass() {
  const manageSelect = document.getElementById('manageClassSelect');
  const renameInput = document.getElementById('renameClassName');
  if (!manageSelect || !renameInput) return;

  const oldName = manageSelect.value;
  const newName = renameInput.value.trim();

  if (!newName) {
    alert('Enter a valid new class name.');
    return;
  }

  if (appState.wordLists[newName]) {
    alert('Class name already exists.');
    return;
  }

  appState.wordLists[newName] = appState.wordLists[oldName];
  delete appState.wordLists[oldName];
  appState.selectedAdminClass = newName;
  renameInput.value = '';

  saveWordListsToStorage();
  populateClassSelects();
  setupAdminClasses();
  updateHomeSummary();
  alert(`Class renamed to ${newName}.`);
}

function deleteClass() {
  const manageSelect = document.getElementById('manageClassSelect');
  if (!manageSelect) return;

  const className = manageSelect.value;
  if (!confirm(`Are you sure you want to delete the class "${className}" and all its words?`)) {
    return;
  }

  delete appState.wordLists[className];
  saveWordListsToStorage();
  populateClassSelects();
  setupAdminClasses();
  updateHomeSummary();
  alert(`Class "${className}" deleted.`);
}

function logoutAdmin() {
  resetAdminLogin();
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
