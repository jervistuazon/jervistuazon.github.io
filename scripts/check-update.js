'use strict';

const { spawnSync } = require('child_process');

const mediaOrigin = 'https://media.jervistuazon.com';
const npmCli = process.env.npm_execpath;
const environment = {
    ...process.env,
    PORTFOLIO_MEDIA_ORIGIN: mediaOrigin
};

function run(script) {
    if (!npmCli) {
        throw new Error('Run this helper through npm run check:update.');
    }

    console.log(`[UPDATE] npm run ${script}`);
    const result = spawnSync(process.execPath, [npmCli, 'run', script], {
        env: environment,
        stdio: 'inherit'
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`npm run ${script} failed with exit code ${result.status}.`);
    }
}

try {
    console.log(`[UPDATE] validating with PORTFOLIO_MEDIA_ORIGIN=${mediaOrigin}`);
    run('build:cloudflare');
    run('test:cloudflare');
    console.log('[UPDATE] portfolio update checks passed.');
} catch (error) {
    console.error(`[UPDATE] ${error.message}`);
    process.exitCode = 1;
}
