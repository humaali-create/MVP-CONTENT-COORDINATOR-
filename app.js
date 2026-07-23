const state = {
  libraryData: [],
  fileName: ''
};

const ui = {
  fileInput: document.getElementById('csvFile'),
  loadSampleButton: document.getElementById('loadSample'),
  uploadStatus: document.getElementById('uploadStatus'),
  processingStatus: document.getElementById('processingStatus'),
  questionInput: document.getElementById('question'),
  response: document.getElementById('response')
};

function init() {
  window.addEventListener('load', () => {
    document.body.classList.add('page-ready');
  });

  ui.fileInput.addEventListener('change', handleFileUpload);
  ui.loadSampleButton.addEventListener('click', loadSampleCatalog);
  document.getElementById('askButton').addEventListener('click', submitQuestion);
  ui.questionInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      submitQuestion();
    }
  });

  document.querySelectorAll('.suggestion-chip').forEach((button) => {
    button.addEventListener('click', () => {
      ui.questionInput.value = button.dataset.question;
      submitQuestion();
    });
  });

  setEmptyState();
}

function setEmptyState() {
  ui.response.innerHTML = '<h3>🧭 Your catalog assistant is ready</h3><p>Upload a CSV file and ask a question to see your first insight.</p>';
  ui.processingStatus.textContent = 'Ready when you are.';
  ui.processingStatus.className = 'status status-neutral';
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) {
    updateStatus('No file selected. Please choose a CSV to continue.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function (loadedEvent) {
    const parsed = parseCatalogCSV(loadedEvent.target.result);
    if (!parsed.length) {
      updateStatus('The file could not be read. Please use a CSV with a title column and at least one data row.', 'error');
      return;
    }

    state.libraryData = parsed;
    state.fileName = file.name;
    updateStatus(`✓ Uploaded ${file.name}. ${state.libraryData.length} records loaded.`, 'success');
    ui.response.innerHTML = '<h3>✅ Catalog ready</h3><p>Your file is loaded and ready for questions. Try asking about genres, countries, languages, or recent releases.</p>';
  };

  reader.onerror = function () {
    updateStatus('The file could not be read. Please try another CSV file.', 'error');
  };

  reader.readAsText(file);
}

function submitQuestion() {
  const question = ui.questionInput.value.trim();
  if (!question) {
    updateStatus('Ask a question to get started.', 'error');
    return;
  }

  if (!state.libraryData.length) {
    updateStatus('No catalog data loaded yet. Upload a CSV first.', 'error');
    return;
  }

  updateStatus('Processing question…', 'neutral');
  window.setTimeout(() => {
    const answer = generateAnswer(question, state.libraryData);
    ui.response.innerHTML = answer;
    updateStatus(`Answered for ${state.fileName || 'your uploaded catalog'}.`, 'success');
  }, 180);
}

function updateStatus(message, type) {
  ui.uploadStatus.textContent = message;
  ui.uploadStatus.className = `status ${type === 'success' ? 'status-success' : type === 'error' ? 'status-error' : 'status-neutral'}`;
  ui.processingStatus.textContent = type === 'neutral' ? message : 'Ready for the next question.';
  ui.processingStatus.className = `status ${type === 'success' ? 'status-success' : type === 'error' ? 'status-error' : 'status-neutral'}`;
}

function loadSampleCatalog() {
  updateStatus('Loading sample catalog…', 'neutral');

  fetch('sample-data.csv')
    .then((response) => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.text();
    })
    .then((text) => {
      const parsed = parseCatalogCSV(text);
      if (!parsed.length) {
        updateStatus('Sample CSV could not be parsed. Please upload a CSV with a title column and at least one data row.', 'error');
        return;
      }

      state.libraryData = parsed;
      state.fileName = 'sample-data.csv';
      updateStatus(`✓ Loaded sample catalog. ${state.libraryData.length} records ready.`, 'success');
      ui.response.innerHTML = '<h3>✅ Sample catalog loaded</h3><p>The sample CSV is ready. Ask a question about genres, regions, languages, or recent titles.</p>';
    })
    .catch(() => {
      updateStatus('Unable to load the sample catalog. Please upload a CSV file instead.', 'error');
    });
}

function generateAnswer(question, data) {
  const normalized = question.toLowerCase();
  const currentYear = new Date().getFullYear();

  if (normalized.includes('how many titles') || normalized.includes('total titles') || normalized.includes('catalog size')) {
    return renderResponse('Library size', 'This shows how many titles are currently in the uploaded catalog.', [
      { label: 'Total titles', value: data.length },
      { label: 'Current year', value: currentYear }
    ], ['Use this number as a quick starting point for planning.']);
  }

  if (normalized.includes('international') && normalized.includes('movie') && normalized.includes('year')) {
    const matches = data.filter((item) => {
      const type = (item.content_type || '').toLowerCase();
      const country = (item.country || '').toLowerCase();
      const releaseYear = Number(item.release_year);
      const isMovie = type.includes('movie');
      const isInternational = !['us', 'usa', 'united states', 'uk', 'united kingdom', 'canada'].some((entry) => country.includes(entry));
      return isMovie && isInternational && releaseYear === currentYear;
    });
    return renderResponse('International movie additions', `There are ${matches.length} international movies from ${currentYear} in this catalog.`, [
      { label: 'Current year', value: currentYear },
      { label: 'International movies', value: matches.length }
    ], matches.slice(0, 5).map((item) => escapeHtml(item.title || 'Untitled')));
  }

  if (normalized.includes('genre') || normalized.includes('genres')) {
    const topGenres = getTopValues(data, 'genre', 5);
    return renderResponse('Top genres', 'These genres appear most often in the catalog.', [
      { label: 'Titles reviewed', value: data.length },
      { label: 'Top genre', value: topGenres[0]?.[0] || 'N/A' }
    ], topGenres.map(([name, count]) => `${escapeHtml(name)} — ${count} titles`));
  }

  if (normalized.includes('movie') || normalized.includes('tv') || normalized.includes('show') || normalized.includes('content type')) {
    const distribution = getTopValues(data, 'content_type', 5);
    return renderResponse('Content type mix', 'This gives a quick view of the split between movies and TV shows.', [
      { label: 'Movies/Shows', value: distribution.length },
      { label: 'Most common', value: distribution[0]?.[0] || 'N/A' }
    ], distribution.map(([name, count]) => `${escapeHtml(name)} — ${count} titles`));
  }

  if (normalized.includes('country') || normalized.includes('countries') || normalized.includes('region') || normalized.includes('regions') || normalized.includes('international')) {
    const countries = getTopValues(data, 'country', 5);
    return renderResponse('Top countries and regions', 'These geographies are most represented in the catalog.', [
      { label: 'Countries tracked', value: countries.length },
      { label: 'Most represented', value: countries[0]?.[0] || 'N/A' }
    ], countries.map(([name, count]) => `${escapeHtml(name)} — ${count} titles`));
  }

  if (normalized.includes('language')) {
    const languages = getTopValues(data, 'language', 5);
    return renderResponse('Languages available', 'This highlights the languages that appear most often.', [
      { label: 'Languages tracked', value: languages.length },
      { label: 'Most common', value: languages[0]?.[0] || 'N/A' }
    ], languages.map(([name, count]) => `${escapeHtml(name)} — ${count} titles`));
  }

  if (normalized.includes('recent') || normalized.includes('latest') || normalized.includes('release')) {
    const recentTitles = [...data].sort((a, b) => Number(b.release_year || 0) - Number(a.release_year || 0)).slice(0, 5);
    return renderResponse('Recent titles', 'Here are the newest additions in the uploaded catalog.', [
      { label: 'Newest title', value: recentTitles[0]?.title || 'N/A' },
      { label: 'Catalog size', value: data.length }
    ], recentTitles.map((item) => `${escapeHtml(item.title || 'Untitled')} — ${escapeHtml(item.release_year || 'Unknown')}`));
  }

  if (normalized.includes('missing') || normalized.includes('gap')) {
    const weakAreas = getGapInsights(data);
    return renderResponse('Potential content gaps', 'This highlights lower-volume areas that may need attention.', [
      { label: 'Titles reviewed', value: data.length },
      { label: 'Suggested gap', value: weakAreas[0]?.name || 'N/A' }
    ], weakAreas.map((item) => `${escapeHtml(item.name)} — ${item.count} titles`));
  }

  return renderResponse('Catalog overview', 'You can ask about genres, languages, regions, content type, recent releases, or missing coverage.', [
    { label: 'Titles', value: data.length },
    { label: 'Example questions', value: 'Try “top genres”' }
  ], ['How many titles do we have?', 'What genres are most common?', 'Which countries have the most content?']);
}

function renderResponse(title, summary, cards, listItems) {
  const statsMarkup = cards.map((card) => `
    <div class="stat-card">
      <span class="label">${escapeHtml(card.label)}</span>
      <div class="value">${escapeHtml(card.value)}</div>
    </div>
  `).join('');

  const listMarkup = listItems && listItems.length
    ? `<ul class="response-list">${listItems.map((item) => `<li>${item}</li>`).join('')}</ul>`
    : '';

  return `
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(summary)}</p>
    <div class="stats-grid">${statsMarkup}</div>
    ${listMarkup}
  `;
}

function getTopValues(data, field, limit = 5) {
  const counts = {};
  data.forEach((item) => {
    const value = (item[field] || 'Unknown').trim();
    if (!value) {
      return;
    }
    counts[value] = (counts[value] || 0) + 1;
  });

  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function getGapInsights(data) {
  const genres = getTopValues(data, 'genre');
  return genres.slice(-3).map(([name, count]) => ({ name, count })).reverse();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseCatalogCSV(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) {
    return [];
  }

  const headerRow = rows[0].map((header) => normalizeHeader(header));
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell && cell.trim()));

  return dataRows.map((row) => {
    const record = {};
    headerRow.forEach((header, index) => {
      const canonical = toCanonicalField(header);
      record[canonical] = (row[index] || '').trim();
    });
    return record;
  }).filter((record) => record.title);
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && next === '\n') {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some((cell) => cell && cell.trim())) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header) {
  return (header || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function toCanonicalField(header) {
  const aliases = {
    title: 'title',
    'content title': 'title',
    genre: 'genre',
    'release year': 'release_year',
    year: 'release_year',
    language: 'language',
    country: 'country',
    region: 'country',
    'country region': 'country',
    'content type': 'content_type',
    type: 'content_type',
    rating: 'rating',
    category: 'category',
    'content category': 'category'
  };

  return aliases[header] || header;
}

init();
