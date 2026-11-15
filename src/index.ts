import * as readline from 'readline';
import chalk from 'chalk';
import { runTurn } from './agent.js';
import { close as closeDb } from './memory/store.js';

console.log(chalk.bold.white("\nchat agent cli\n"))
console.log(chalk.dim("\nType \'exit\' or press \'ctrl c\' to exit\n"))

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(): void {
  rl.question(chalk.bold.green('\n  You: '), async (input) => {
    const trimmed = input.trim();

    if (!trimmed) {
      prompt();
      return;
    }

    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      console.log(chalk.dim('\n  Goodbye! Your conversations are saved.\n'));
      closeDb();
      rl.close();
      process.exit(0);
    }

    // Print a blank line before the response
    process.stdout.write(chalk.bold.blue('\n  agent: '));

    let isFirstDelta = true;

    try {
      await runTurn(trimmed, {
        onSearchStart(query) {
          // Show search activity
          if (!isFirstDelta) {
            process.stdout.write('\n');
          }
          process.stdout.write(
            chalk.dim(`\n  Searching: "${query}"...`),
          );
        },

        onSearchDone(count) {
          process.stdout.write(
            chalk.dim(`  ${count} results\n`),
          );
          // Re-print the assistant prefix for the continuing response
          process.stdout.write(chalk.bold.blue('\n  agent: '));
          isFirstDelta = true;
        },

        onTextDelta(delta) {
          // Indent multi-line responses for readability
          const indented = delta.replace(/\n/g, '\n  ');
          process.stdout.write(indented);
          isFirstDelta = false;
        },

        onError(error) {
          console.error(
            chalk.red(`\n  Error: ${error.message}`),
          );
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`\n  Error: ${msg}`));

      // Hint at common issues
      if (msg.includes('401') || msg.includes('403')) {
        console.error(
          chalk.yellow('  Check your API keys in .env'),
        );
      }
      if (msg.includes('429')) {
        console.error(
          chalk.yellow('  Rate limited. Wait a moment and try again.'),
        );
      }
    }

    console.log(''); // blank line after response
    prompt();
  });
}

// start
prompt()

// graceful shutdown on ctrl c
rl.on('SIGINT', async () => {
  console.log(chalk.dim('\n\n  Goodbye! Your conversations are saved.\n'));

  rl.close();

  try {
    closeDb();
  } catch (error) {
    console.error('Error closing database:', error);
  }

  process.exit(0);
});