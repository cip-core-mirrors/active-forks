let token = localStorage.getItem('token');

window.addEventListener('load', () => {
  initDT(); // Initialize the DatatTable and window.columnNames variables
  addDarkmodeWidget();

  const repo = getRepoFromUrl();

  if (token) {
    const tokenElement = document.getElementById('token');
    tokenElement.value = token;
  }

  if (repo) {
    document.getElementById('q').value = repo;
    fetchData();
  }
});

document.getElementById('form').addEventListener('submit', e => {
  e.preventDefault();
  fetchData();
});

function toggleToken() {
  const button = document.getElementById('collapsible');
  button.classList.toggle('active');

  const content = button.parentElement.previousElementSibling;
  content.classList.toggle('hidden');
  button.innerHTML = content.classList.contains('hidden') ? 'Show' : 'Collapse';
}

function addDarkmodeWidget() {
  new Darkmode( { label: '🌓' } ).showWidget();
}

let fetching = false;
async function fetchData() {
  if (fetching) return;

  setLoading(true);

  const repo = document.getElementById('q').value;
  const re = /[-_\w]+\/[-_.\w]+/;

  const urlRepo = getRepoFromUrl();

  if (!urlRepo || urlRepo !== repo) {
    window.history.pushState('', '', `#${repo}`);
  }

  if (re.test(repo)) {
    await fetchAndShow(repo);
  } else {
    showMsg(
      'Invalid GitHub repository! Format is &lt;username&gt;/&lt;repo&gt;',
      'danger'
    );
  }

  setLoading(false);
}

function setLoading(isLoading) {
  fetching = isLoading;
  const classes = document.getElementById('loading').classList;
  isLoading ? classes.remove('hidden') : classes.add('hidden');

  if (isLoading) {
    // Remove any alerts, if any:
    if ($('.alert')) $('.alert').remove();
  }
}

async function updateDT(repository, forks, history) {
  const dataSet = [];

  let isFirstCall = history === undefined;
  if (isFirstCall) {
    dataSet.push(await parseRepository(repository));
    history = await getCommitsHistory(repository);
  }

  const promises = [];
  for (const fork of forks) {
    promises.push(parseRepository(fork, history));
  }

  const responses = await Promise.allSettled(promises);
  dataSet.push(...responses.filter(response => response.status === 'fulfilled').map(response => response.value));

  if (isFirstCall) window.forkTable.clear();

  window.forkTable
      .rows.add(dataSet)
      .draw();

  return history;
}

function initDT() {
  // Create ordered Object with column name and mapped display name
  window.columnNamesMap = [
    'Link',
    'Owner',
    'Name',
    'Main Branch',
    'Stars',
    'Forks',
    'Open\nIssues',
    'Size',
    'Last\nPush',
    'Commits\nBehind',
    'Commits\nAhead',
    //'Additions',
    //'Deletions',
  ];

  // Sort by stars:
  const sortColName = 'Stars';
  const sortColumnIdx = window.columnNamesMap.indexOf(sortColName);

  // Use first index for readable column name
  // we use moment's fromNow() if we are rendering for `pushed_at`; better solution welcome
  window.forkTable = $('#forkTable').DataTable({
    columns: window.columnNamesMap.map(colNM => {
      return {
        title: colNM,
        render:
            colNM === 'Last Push'
                ? (data, type, _row) => {
                  if (type === 'display') {
                    return moment(data).fromNow();
                  }
                  return data;
                }
                : null,
      };
    }),
    order: [[sortColumnIdx, 'desc']],
    scrollX: true,
  });
}

async function fetchAndShow(repo) {
  const tokenField = document.getElementById('token');
  const localToken = tokenField.value;
  if (localToken) token = localToken;

  if (localToken) {
    localStorage.setItem('token', localToken);
  } else {
    localStorage.removeItem('token');
    return;
  }

  repo = repo.replace('https://github.com/', '');
  repo = repo.replace('http://github.com/', '');
  repo = repo.replace(/\.git$/, '');

  const repoInfo = repo.split('/');
  const owner = repoInfo[0];
  const name = repoInfo[1];

  const info = window.forkTable.page.info();

  try {
    const repository = await getRepository(owner, name);
    let forks = await getRepositoryForks(repository, info.length);

    const history = await updateDT(repository, forks);

    const forksCount = repository.forks_count;
    let totalForks = forks.length;
    updateProgression(totalForks, forksCount);
    let page = 1;
    while (forks.length === info.length) {
      forks = await getRepositoryForks(repository, info.length, ++page);
      totalForks += forks.length;
      await updateDT(repository, forks, history);
      updateProgression(totalForks, forksCount);
    }
    hideProgression();
  } catch (error) {
    const msg =
        error.toString().indexOf('Forbidden') >= 0
            ? 'Error: API Rate Limit Exceeded'
            : error;
    showMsg(`${msg}. Additional info in console`, 'danger');
    console.error(error);
  }
}

function updateProgression(count, total) {
  document.getElementById('progression').innerHTML = `Retrieving forks (${parseInt(count / total * 100)}%)`;
}

function hideProgression() {
  document.getElementById('progression').innerHTML = '';
}

function showMsg(msg, type) {
  let alert_type = 'alert-info';

  if (type === 'danger') {
    alert_type = 'alert-danger';
  }

  document.getElementById('footer').innerHTML = '';

  document.getElementById('data-body').innerHTML = `
        <div class="alert ${alert_type} alert-dismissible fade show" role="alert">
            <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                <span aria-hidden="true">&times;</span>
            </button>
            ${msg}
        </div>
    `;
}