const githubUrl = 'https://api.github.com';

let rateLimit;

async function callApi(url, parameters = {}) {
    if (Object.keys(parameters).length > 0) {
        url = `${url}?${Object.entries(parameters).map(entry => `${entry[0]}=${encodeURIComponent(entry[1])}`).join('&')}`;
    }

    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };

    const result = await fetch(url, {
        method: 'GET',
        headers: headers,
        //cache: 'no-cache',
    });

    if (rateLimit === undefined) {
        rateLimit = document.getElementById('rate-limit');
        rateLimit.parentElement.classList.remove('hidden');
    }
    const responseHeaders = result.headers;
    const diff = new Date(responseHeaders.get('X-RateLimit-Reset') * 1000) - new Date();
    const minutes = Math.floor(diff / 1000 / 60);
    rateLimit.innerHTML = `Quota : ${responseHeaders.get('X-RateLimit-Remaining')}/${responseHeaders.get('X-RateLimit-Limit')}<br>Resets in ${minutes} min`;

    if (!result.ok) {
        console.error(result);
        //throw Error(result);
    }

    return await result.json();
}

async function getRepository(owner, repo) {
    return callApi(`${githubUrl}/repos/${owner}/${repo}`)
}

async function getRepositoryForks(repository, perPage = 100, page = 1, sort = 'stargazers') {
    return callApi(repository.forks_url, {
        per_page: perPage,
        page: page,
        sort: sort,
    });
}

function getRepoFromUrl() {
    const urlRepo = location.hash && location.hash.slice(1);

    return urlRepo && decodeURIComponent(urlRepo);
}

async function parseRepository(repository, originalRepositoryHistory) {
    const row = [
        `<a href="${repository.html_url}" target="_blank">Link</a>`,
        repository.owner ? repository.owner.login : '<strike><em>Unknown</em></strike>',
        repository.name,
        repository.default_branch,
        repository.stargazers_count,
        repository.forks_count,
        repository.open_issues_count,
        repository.size,
        repository.pushed_at,
    ];

    if (originalRepositoryHistory) {
        const history = await getCommitsHistory(repository);
        const diffBehind = commitsDiff(originalRepositoryHistory, history);
        const diffAhead = commitsDiff(history, originalRepositoryHistory);
        row.push(...[
            diffBehind.commits !== undefined ? formatInteger(-diffBehind.commits) : `over -100`,
            diffBehind.commits !== undefined ? formatInteger(diffAhead.commits) : `over 100`,
            //diffAhead.commits !== undefined ? formatInteger(diffAhead.additions) : `over ${diffAhead.additions}`,
            //diffAhead.commits !== undefined ? formatInteger(-diffAhead.deletions) : `over ${-diffAhead.deletions}`,
        ]);
    } else {
        row.push(...[
            0,
            0,
            //0,
            //0,
        ]);
    }

    return row;
}

function formatInteger(integer) {
    return `${integer > 0 ? '+' : ''}${integer}`;
}

function commitsDiff(historyA, historyB) {
    let counts = {
        commits: 0,
        additions: 0,
        deletions: 0,
    };
    for (const commitA of historyA) {
        for (const commitB of historyB) {
            if (commitA.sha === commitB.sha) {
                return counts;
            }
        }
        counts.commits++;
        counts.additions += commitA.additions; // TODO : get additions / deletions
        counts.deletions += commitA.deletions;
    }

    // Return undefined if not found, commit is more than 100 commits ahead due to GraphQL limit
    counts.commits = undefined;
    return counts;
}

async function getCommitsHistory(repository) {
    const defaultBranch = repository.default_branch;
    return await callApi(repository.commits_url.replace('{/sha}', ''), {
        sha: defaultBranch,
        per_page: 100,
    });
}

function getRepoFromUrl() {
    const urlRepo = location.hash && location.hash.slice(1);

    return urlRepo && decodeURIComponent(urlRepo);
}