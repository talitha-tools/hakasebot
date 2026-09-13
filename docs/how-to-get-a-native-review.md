# How to get a native GitHub review

Usual install is the Lab plus a Home repo. The Hosted bot App wakes Lab,
which starts the Home dispatcher. Consumer repos keep the bot App and
nothing else.

## What you need

A GitHub account that can install the Hosted bot App, plus at least one
vault account and model slot in the Dashboard.

## Steps

1. Open Lab, sign in, and set the encryption key.
2. Add a vault account and a model slot.
3. Bootstrap the Home repo from the Dashboard. Install the Hosted bot App on
   that Home repo.
4. Enable a consumer repository. Install the Hosted bot App on that repo.
5. Finish secret sync from the browser so the Home repo has the encryption
   key.
6. Open or push a pull request on the consumer repo (or mention the bot).
7. Wait for the progress comment and the native review.

## What you should see

The pull request gets a progress comment with the Home Actions run URL.
When the run finishes, a native review lands from the Hosted bot App.
