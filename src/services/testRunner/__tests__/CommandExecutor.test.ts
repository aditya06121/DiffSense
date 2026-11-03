import * as os from 'os';
import { CommandExecutor, renderCommand, stripAnsi } from '../CommandExecutor';
import { RunSpec } from '../types';

describe('CommandExecutor', () => {
  const executor = new CommandExecutor();
  const cwd = os.tmpdir();

  it('captures stdout and a zero exit code on success', async () => {
    const spec: RunSpec = { bin: 'node', args: ['-e', "console.log('hello')"], cwd };
    const result = await executor.run(spec, 5000);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
  });

  it('captures a non-zero exit code and stderr on failure', async () => {
    const spec: RunSpec = {
      bin: 'node',
      args: ['-e', "console.error('boom'); process.exit(3)"],
      cwd,
    };
    const result = await executor.run(spec, 5000);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe('boom');
  });

  it('kills a command that exceeds its timeout and reports a non-zero exit code', async () => {
    const spec: RunSpec = { bin: 'node', args: ['-e', 'setTimeout(() => {}, 10000)'], cwd };
    const result = await executor.run(spec, 300);
    expect(result.exitCode).not.toBe(0);
  }, 10000);

  it('never lets a shell metacharacter-laden argv entry be interpreted - no shell is ever spawned', async () => {
    // The whole point of using execFile over exec: bin/args go straight to the OS as argv, so a filename
    // like this arrives as one literal string argument instead of being parsed as a subshell + rm -rf.
    const maliciousArg = '$(touch /tmp/should-not-exist-from-test).test.ts; rm -rf /tmp/should-not-exist';
    const spec: RunSpec = {
      bin: 'node',
      args: ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', maliciousArg],
      cwd,
    };
    const result = await executor.run(spec, 5000);
    const receivedArgs = JSON.parse(result.stdout);
    expect(receivedArgs).toEqual([maliciousArg]);
  });

  it('preserves spaces and single quotes in a single argv entry', async () => {
    const trickyArg = "it's a file with spaces.test.ts";
    const spec: RunSpec = {
      bin: 'node',
      args: ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', trickyArg],
      cwd,
    };
    const result = await executor.run(spec, 5000);
    expect(JSON.parse(result.stdout)).toEqual([trickyArg]);
  });
});

describe('renderCommand', () => {
  it('renders plain args unquoted and args with special characters quoted, for display only', () => {
    const spec: RunSpec = { bin: 'npx', args: ['jest', 'src/foo.test.ts', "it's a file.test.ts"], cwd: '/repo' };
    expect(renderCommand(spec)).toBe(`npx jest src/foo.test.ts 'it'\\''s a file.test.ts'`);
  });
});

describe('stripAnsi', () => {
  it('removes ANSI escape sequences and leaves plain text untouched', () => {
    expect(stripAnsi('[31mred text[0m')).toBe('red text');
    expect(stripAnsi('plain text')).toBe('plain text');
    expect(stripAnsi('')).toBe('');
  });
});
