import { BrowserAdapter } from './core/browser-adapter';
import { ClickHandler } from './handlers/click-handler';
import { QuizHandler } from './handlers/quiz-handler';
import { MetricsStore } from './utils/storage';
import { initLogger } from './utils/logger';
import type { RunConfig, ActionResult } from './types';
import { homedir } from 'os';
import { join } from 'path';

interface ExtendedConfig extends RunConfig {
  skipClicks: boolean;
  skipQuizzes: boolean;
  showMetrics: boolean;
}

/**
 * Get the default Edge user data directory based on OS
 * Uses a separate profile folder to avoid conflicts with running Edge
 */
function getDefaultEdgeUserDataDir(): string {
  const home = homedir();

  if (process.platform === 'win32') {
    // Windows: Use a dedicated folder in user's home to avoid Edge conflicts
    return join(home, '.ms-rewards-agent', 'edge-profile');
  } else if (process.platform === 'darwin') {
    // macOS: ~/Library/Application Support/ms-rewards-agent
    return join(home, 'Library', 'Application Support', 'ms-rewards-agent', 'edge-profile');
  } else {
    // Linux: ~/.ms-rewards-agent/edge-profile
    return join(home, '.ms-rewards-agent', 'edge-profile');
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): ExtendedConfig {
  const args = process.argv.slice(2);

  const config: ExtendedConfig = {
    userDataDir: getDefaultEdgeUserDataDir(),
    dryRun: false,
    maxActionsPerHour: 30,
    skipClicks: false,
    skipQuizzes: false,
    showMetrics: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run' || arg === '-d') {
      config.dryRun = true;
    } else if (arg === '--user-data-dir' || arg === '-u') {
      config.userDataDir = args[++i] || config.userDataDir;
    } else if (arg === '--max-actions' || arg === '-m') {
      config.maxActionsPerHour = parseInt(args[++i] ?? '', 10) || config.maxActionsPerHour;
    } else if (arg === '--skip-clicks') {
      config.skipClicks = true;
    } else if (arg === '--skip-quizzes') {
      config.skipQuizzes = true;
    } else if (arg === '--metrics') {
      config.showMetrics = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
MS Rewards Agent - Automated Microsoft Rewards collector

Usage: pnpm run start [options]

Options:
  -d, --dry-run          Log actions without executing (safe mode)
  -u, --user-data-dir    Path to browser user data directory (default: Edge profile)
  -m, --max-actions      Maximum actions per hour (default: 30)
  -s, --search-count     Number of Bing searches to perform (default: 3)
  --skip-clicks          Skip click activities
  --skip-quizzes         Skip quiz activities
  --metrics              Show metrics summary and exit
  -h, --help             Show this help message

Example:
  pnpm run start -- --dry-run
  pnpm run start -- -u ./my_profile -m 20
  pnpm run start -- --metrics
`);
      process.exit(0);
    }
  }

  return config;
}

const main = async () => {
  const config = parseArgs();
  const metrics = new MetricsStore('./.rewards-metrics.json');
  const logger = initLogger({
    filePath: './.rewards.log',
    minLevel: config.dryRun ? 'debug' : 'info',
  });

  // Show metrics only if requested
  if (config.showMetrics) {
    const summary = metrics.getSummary();
    console.log('\n=== Metrics Summary ===');
    console.log(`Total Runs: ${summary.totalRuns}`);
    console.log(`Today's Points: ${summary.todayPoints}`);
    console.log(`Success Rate: ${(summary.successRate * 100).toFixed(1)}%`);
    console.log(`Avg Duration: ${summary.avgDuration.toFixed(0)}ms`);
    console.log(`\nBy Handler:`);
    for (const [handler, stats] of Object.entries(summary.handlerStats)) {
      console.log(`  ${handler}: ${stats.runs} runs (${(stats.successRate * 100).toFixed(1)}% success)`);
    }
    process.exit(0);
  }

  console.log('MS Rewards Agent Starting...');
  console.log(`  Mode: ${config.dryRun ? 'DRY-RUN (no real actions)' : 'LIVE'}`);
  console.log(`  User Data: ${config.userDataDir}`);
  console.log(`  Max Actions/Hour: ${config.maxActionsPerHour}`);
  console.log(`  Skip Clicks: ${config.skipClicks}`);
  console.log(`  Skip Quizzes: ${config.skipQuizzes}`);
  console.log('');

  if (!config.dryRun) {
    console.log('⚠️  WARNING: Running in LIVE mode. Actions will be performed.');
    console.log('⚠️  Use --dry-run for safe testing.');
    console.log('');
  }

  const browser = new BrowserAdapter();
  const results: { handler: string; result: ActionResult }[] = [];

  try {
    // Initialize browser with the user profile
    await browser.init(config.userDataDir, false);
    const page = browser.getPage();

    // Run Click Handler
    if (!config.skipClicks) {
      console.log('\n=== Running Click Handler ===');
      logger.info('Starting ClickHandler');
      const clickHandler = new ClickHandler(browser, {
        dryRun: config.dryRun,
        maxActionsPerHour: config.maxActionsPerHour,
      });
      const clickResult = await clickHandler.run(page);
      results.push({ handler: 'ClickHandler', result: clickResult });
      logger.logResult('ClickHandler', clickResult);
      metrics.recordRun('ClickHandler', clickResult.status, clickResult.durationMs, clickResult.attempts, clickResult.meta);
    }

    // Run Quiz Handler
    if (!config.skipQuizzes) {
      console.log('\n=== Running Quiz Handler ===');
      logger.info('Starting QuizHandler');
      const quizHandler = new QuizHandler(browser, {
        dryRun: config.dryRun,
        maxActionsPerHour: config.maxActionsPerHour,
      });
      const quizResult = await quizHandler.run(page);
      results.push({ handler: 'QuizHandler', result: quizResult });
      logger.logResult('QuizHandler', quizResult);
      metrics.recordRun('QuizHandler', quizResult.status, quizResult.durationMs, quizResult.attempts, quizResult.meta);
    }

    // Print summary
    console.log('\n=== Run Summary ===');
    for (const { handler, result } of results) {
      console.log(`\n${handler}:`);
      console.log(`  Status: ${result.status}`);
      console.log(`  Attempts: ${result.attempts}`);
      console.log(`  Duration: ${result.durationMs}ms`);
      if (result.meta) {
        console.log(`  Meta: ${JSON.stringify(result.meta, null, 2)}`);
      }
    }

    // Keep open briefly to inspect
    await new Promise(r => setTimeout(r, 3000));

  } catch (err) {
    console.error('Fatal Error:', err);
    logger.error('Fatal error occurred', err instanceof Error ? err : String(err));
    process.exit(1);
  } finally {
    await browser.close();
    console.log('\nAgent finished.');
    logger.info('Agent finished');
    logger.close();
  }
};

main().catch(console.error);
