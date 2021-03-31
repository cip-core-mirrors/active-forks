let token = localStorage.getItem('token');
const githubUrl = 'https://api.github.com/graphql';

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
}

function updateDT(data, isFirstCall = false) {
  // Remove any alerts, if any:
  if ($('.alert')) $('.alert').remove();

  const repository = data.repository;
  // Format dataset and redraw DataTable. Use second index for key name
  const dataSet = [];
  if (isFirstCall) dataSet.push(parseRepository(repository));
  for (const fork of repository.forks.nodes) {
    dataSet.push(parseRepository(fork, repository));
  }

  if (isFirstCall) window.forkTable.clear()

  window.forkTable
    .rows.add(dataSet)
    .draw();
}

function commitsDiff(historyA, historyB) {
  let counts = {
    commits: 0,
    additions: 0,
    deletions: 0,
  };
  for (const commitA of historyA) {
    for (const commitB of historyB) {
      if (commitA.oid === commitB.oid) {
        return counts;
      }
    }
    counts.commits++;
    counts.additions += commitA.additions;
    counts.deletions += commitA.deletions;
  }

  // Return undefined if not found, commit is more than 100 commits ahead due to GraphQL limit
  counts.commits = undefined;
  return counts;
}

function getCommitsHistory(repository) {
  return repository.defaultBranchRef.target.history.nodes;
}

function parseRepository(repository, originalRepository) {
  const row = [
    `<a href="${repository.url}">Link</a>`,
    repository.owner ? repository.owner.login : '<strike><em>Unknown</em></strike>',
    repository.name,
    repository.defaultBranchRef.name,
    repository.stargazerCount,
    repository.forkCount,
    repository.issues.totalCount,
    repository.diskUsage,
    repository.pushedAt,
  ];

  if (originalRepository) {
    const historyA = getCommitsHistory(originalRepository);
    const historyB = getCommitsHistory(repository);
    const diffBehind = commitsDiff(historyA, historyB);
    const diffAhead = commitsDiff(historyB, historyA);
    row.push(...[
      formatInteger(-diffBehind.commits),
      formatInteger(diffAhead.commits),
      formatInteger(diffAhead.additions),
      formatInteger(-diffAhead.deletions),
    ]);
  } else {
    row.push(...[0, 0, 0, 0]);
  }

  return row;
}

function formatInteger(integer) {
  if (integer === undefined) return 'over 100';

  return `${integer > 0 ? '+' : ''}${integer}`;
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
    'Open Issues',
    'Size',
    'Last Push',
    'Commits Behind',
    'Commits Ahead',
    'Additions',
    'Deletions',
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

async function graphQL(query, variables) {
  const body = { query, variables };
  const result = await fetch(githubUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!result.ok) throw Error(result.statusText);

  const jsonResponse = await result.json();
  return jsonResponse.data;
}

async function fetchAndShow(repo) {
  if (!token) token = document.getElementById('token').value;
  localStorage.setItem('token', token);

  if (!token) return;

  repo = repo.replace('https://github.com/', '');
  repo = repo.replace('http://github.com/', '');
  repo = repo.replace(/\.git$/, '');

  const repoInfo = repo.split('/');
  const owner = repoInfo[0];
  const name = repoInfo[1];

  const variables = {
    owner: owner,
    name: name,
    until: new Date().toISOString(),
    forksPerPage: 100,
  };

  try {
    let response = await fetch('graphql/forks.graphql');
    const query = await response.text();
    const data = await graphQL(query, variables);
    updateDT(data, true);

    let nextQuery = undefined;
    let pageInfo = data.repository.forks.pageInfo;
    while (pageInfo.hasNextPage) {
      if (!nextQuery) {
        response = await fetch('graphql/forksWithCursor.graphql');
        nextQuery = await response.text();
        variables.afterForkCursor = pageInfo.endCursor;
      }
      const nextData = await graphQL(nextQuery, variables);
      updateDT(nextData, false);
      pageInfo = nextData.repository.forks.pageInfo;
    }
  } catch (error) {
    const msg =
        error.toString().indexOf('Forbidden') >= 0
            ? 'Error: API Rate Limit Exceeded'
            : error;
    showMsg(`${msg}. Additional info in console`, 'danger');
    console.error(error);
  }
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

function getRepoFromUrl() {
  const urlRepo = location.hash && location.hash.slice(1);

  return urlRepo && decodeURIComponent(urlRepo);
}
