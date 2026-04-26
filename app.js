let wordLists = {};
let currentWords = [];
let currentWord = "";
let score = 0;
let total = 0;
let adminLoggedIn = false;
let selectedAdminClass = "";
const ADMIN_USER = "admin";
const ADMIN_PASS = "password123";

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadWords().then(() => {
    populateClassSelect();
    if (document.getElementById('admin')) {
      resetAdminLogin();
    }
  });
});

function loadWords() {
  return fetch('words.json')
    .then(response => response.json())
    .then(data => {
      wordLists = data;
      console.log('Words loaded:', wordLists);
    })
    .catch(error => console.error('Error loading words:', error));
}

function populateClassSelect() {
  const select = document.getElementById('classSelect');
  if (!select) return;

  select.innerHTML = '';
  const classes = Object.keys(wordLists).sort();
  classes.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.innerText = category.toUpperCase();
    select.appendChild(option);
  });
}

function startPractice() {
  const selected = document.getElementById('classSelect').value;
  const range = document.getElementById('rangeSelect').value;

  let allWords = wordLists[selected] || [];

  if (range === 'all') {
    currentWords = [...allWords];
  } else {
    let [start, end] = range.split('-').map(Number);

    // Convert to zero-based index
    start = start - 1;
    end = end - 1;

    // Prevent overflow
    start = Math.max(0, start);
    end = Math.min(allWords.length - 1, end);

    currentWords = allWords.slice(start, end + 1);
  }

  // Handle empty result
  if (currentWords.length === 0) {
    document.getElementById('wordList').innerHTML =
      "<p style='text-align:center;'>⚠️ No words available for this range.</p>";

    document.getElementById('home').style.display = 'none';
    document.getElementById('practice').style.display = 'block';
    return;
  }

  // Switch screen
  document.getElementById('home').style.display = 'none';
  document.getElementById('practice').style.display = 'block';

  // Display words
  let html = '';
  currentWords.forEach(word => {
    html += `
      <li class="word-item">
        <span>${word}</span>
        <button onclick="speak('${word}')">🔊 Speak</button>
      </li>
    `;
  });

  document.getElementById('wordList').innerHTML =
    `<ul class="word-list">${html}</ul>`;
}

function startTest() {
  const selected = document.getElementById('classSelect').value;
  currentWords = [...wordLists[selected]];

  score = 0;
  total = 0;

  document.getElementById('home').style.display = 'none';
  document.getElementById('test').style.display = 'block';

  nextWord();
}

function speak(word) {
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.rate = 0.8;
  window.speechSynthesis.speak(utterance);
}

function speakWord() {
  speak(currentWord);
}

function nextWord() {
  if (currentWords.length === 0) {
    document.getElementById('wordDisplay').innerText = '✅ Test Completed!';
    document.getElementById('score').innerText = `Final Score: ${score}/${total}`;
    document.querySelector('button[onclick="nextWord()"]').disabled = true;
    return;
  }

  const index = Math.floor(Math.random() * currentWords.length);
  currentWord = currentWords.splice(index, 1)[0];

  document.getElementById('answer').value = '';
  document.getElementById('result').innerText = '';
  document.getElementById('wordDisplay').innerText = 'Click Speak';
}

function submitAnswer() {
  const userAnswer = document.getElementById('answer').value.trim().toLowerCase();

  total++;

  if (userAnswer === currentWord) {
    score++;
    document.getElementById('result').innerText = '✅ Correct!';
    document.getElementById('result').style.color = '#4caf50';
  } else {
    document.getElementById('result').innerText = `❌ Wrong! Correct: ${currentWord}`;
    document.getElementById('result').style.color = '#f44336';
  }

  document.getElementById('score').innerText = `Score: ${score}/${total}`;
}

function goHome() {
  document.getElementById('practice').style.display = 'none';
  document.getElementById('test').style.display = 'none';
  document.getElementById('admin').style.display = 'none';
  document.getElementById('home').style.display = 'block';
}

function openAdmin() {
  resetAdminLogin();
  document.getElementById('home').style.display = 'none';
  document.getElementById('admin').style.display = 'block';
}

function resetAdminLogin() {
  adminLoggedIn = false;
  selectedAdminClass = '';

  const loginSection = document.getElementById('adminLogin');
  const dashboardSection = document.getElementById('adminDashboard');
  const loginError = document.getElementById('adminLoginError');

  if (loginSection) {
    loginSection.classList.remove('hidden');
  }
  if (dashboardSection) {
    dashboardSection.classList.add('hidden');
  }
  if (loginError) {
    loginError.innerText = '';
  }
  if (document.getElementById('adminUsername')) {
    document.getElementById('adminUsername').value = '';
  }
  if (document.getElementById('adminPassword')) {
    document.getElementById('adminPassword').value = '';
  }
}

function loginAdmin() {
  const username = document.getElementById('adminUsername').value.trim();
  const password = document.getElementById('adminPassword').value;
  const loginError = document.getElementById('adminLoginError');

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    adminLoggedIn = true;
    if (loginError) {
      loginError.innerText = '';
    }
    document.getElementById('adminLogin').classList.add('hidden');
    document.getElementById('adminDashboard').classList.remove('hidden');
    setupAdminClasses();
  } else {
    if (loginError) {
      loginError.innerText = 'Invalid username or password.';
    }
  }
}

function setupAdminClasses() {
  const select = document.getElementById('classSelectAdmin');
  const manageSelect = document.getElementById('manageClassSelect');
  if (!select) {
    return;
  }

  const classes = Object.keys(wordLists).sort();
  select.innerHTML = '';
  classes.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.innerText = category.toUpperCase();
    select.appendChild(option);
  });

  if (manageSelect) {
    manageSelect.innerHTML = '';
    classes.forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.innerText = category.toUpperCase();
      manageSelect.appendChild(option);
    });
  }

  selectedAdminClass = select.value || classes[0];
  loadAdminClass();
}

function loadAdminClass() {
  const select = document.getElementById('classSelectAdmin');
  const editor = document.getElementById('wordsEditor');

  if (!select || !editor) {
    return;
  }

  selectedAdminClass = select.value;
  editor.value = (wordLists[selectedAdminClass] || []).join(', ');
}

function addAdminClass() {
  const input = document.getElementById('newClassName');
  const className = input.value.trim();

  if (!className) {
    alert('Enter a valid class name.');
    return;
  }

  if (wordLists[className]) {
    alert('Class already exists. Choose another name.');
    return;
  }

  wordLists[className] = [];
  selectedAdminClass = className;
  input.value = '';
  setupAdminClasses();
  document.getElementById('classSelectAdmin').value = selectedAdminClass;
  loadAdminClass();
  saveWords();
  alert(`New class ${className} added.`);
}

function renameClass() {
  const manageSelect = document.getElementById('manageClassSelect');
  const renameInput = document.getElementById('renameClassName');
  const oldName = manageSelect.value;
  const newName = renameInput.value.trim();

  if (!newName) {
    alert('Enter a valid new class name.');
    return;
  }

  if (wordLists[newName]) {
    alert('Class name already exists.');
    return;
  }

  wordLists[newName] = wordLists[oldName];
  delete wordLists[oldName];
  selectedAdminClass = newName;
  renameInput.value = '';
  setupAdminClasses();
  document.getElementById('classSelectAdmin').value = selectedAdminClass;
  loadAdminClass();
  saveWords();
  alert(`Class renamed to ${newName}.`);
}

function deleteClass() {
  const manageSelect = document.getElementById('manageClassSelect');
  const className = manageSelect.value;

  if (!confirm(`Are you sure you want to delete the class "${className}" and all its words?`)) {
    return;
  }

  delete wordLists[className];
  setupAdminClasses();
  if (selectedAdminClass === className) {
    selectedAdminClass = Object.keys(wordLists).sort()[0] || '';
    loadAdminClass();
  }
  saveWords();
  alert(`Class "${className}" deleted.`);
}

function logoutAdmin() {
  resetAdminLogin();
}

function saveWords() {
  if (!adminLoggedIn) {
    alert('Please log in to save admin changes.');
    return;
  }

  const editor = document.getElementById('wordsEditor');
  if (!editor) {
    return;
  }

  wordLists[selectedAdminClass] = editor.value
    .split(',')
    .map(word => word.trim())
    .filter(word => word.length > 0);

  fetch('/api/words', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(wordLists)
  })
    .then(response => response.json())
    .then(data => {
      alert('Words saved successfully!');
    })
    .catch(error => console.error('Error saving words:', error));
}
