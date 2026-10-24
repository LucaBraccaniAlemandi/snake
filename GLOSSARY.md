# Agent Tester

A tool where testers describe end-to-end tests in plain English, refine them as a list of steps, run them in a real browser and get failures diagnosed and fixed by an AI.

## Tests

**Workspace**:
A named group of Tests, usually for one product. It has no members or permissions: everyone sees every Workspace.
_Avoid_: Project, team, tenant, organization

**Test**:
A named, runnable scenario against one web app, made of a Starting URL and an ordered list of Steps.
_Avoid_: Spec, scenario, test case

**Starting URL**:
The page a Test opens before its first Step. It belongs to the Test and is never a Step.
_Avoid_: Base URL, target

**Step**:
One user action or one check, written as a single plain-English sentence. A Test's Steps are its source of truth.
_Avoid_: Line, instruction, statement

**Action**:
A Step the browser agent performs, e.g. "Add the first product to the cart".
_Avoid_: Act, command

**Check**:
A Step verified by AI judgement of the page, e.g. "The cart shows a 10% discount".
_Avoid_: Assertion, assert

**Expectation**:
A Step verified exactly, without AI: either a text being visible or the URL containing a fragment.
_Avoid_: Assertion, deterministic check

**Script**:
The e2e test file generated from a Test's Steps. It is derived, never edited as the source.
_Avoid_: Code, test file

## Runs

**Run**:
One execution of a snapshot of a Test's Steps in a real browser. It ends as passed, failed or error.
_Avoid_: Execution, job, attempt

**Failed** (Run):
The app didn't behave as a Step described. The Test may be wrong or the app may be broken.

**Error** (Run):
The Run couldn't judge the app, e.g. the model is unavailable or the app is unreachable. This is never the Test's fault.
_Avoid_: Crash, infra failure

**Step Result**:
The outcome of one Step within a Run: passed, failed or skipped, with an error and screenshot when it failed.

**Run Summary**:
The compact account of a Run that is handed to an AI: status, the failed Step, a short error and a screenshot link. It never contains full logs.
_Avoid_: Report, log

**Replay Cache**:
Recorded browser actions for a Test's Actions. Unchanged Actions replay from it without calling a model.
_Avoid_: Cache (unqualified)

## People

**Tester**:
The human who writes, edits and runs Tests in the web app.
_Avoid_: User, QA
