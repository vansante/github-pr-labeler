# PR-Labeler

> A GitHub App built with [Probot](https://github.com/probot/probot) that labels pull requests automatically

## Configuration

See [config-sample](pr-labeler.sample.yml) for an example of a configuration yaml file that can be placed
in your repository in the path `.github/pr-labeler.yml`.

### Simple on/off labels

There are a number of possible on/off flags that when triggered allow setting a single label.

These are:
- `has-milestone-label`: The label under the value will be applied when there is a milestone attached
    to this PR.
- `has-comments-label`: The label under the value will be applied when there are comments on this PR.
- `has-review-comments-label`: The label under the value will be applied when there are review comments
    on this PR.
- `is-mergeable-label`: The label under the value will be applied when there are no checks stopping this
    PR from being merged.
- `is-draft-label`: The label under the value will be applied when the PR is a draft.

### Labels to apply for certain paths

Under the `path-labels` key you can store labels that should be applied when certain paths are touched in a PR.
The path values allow wildcards and partial paths.

For example:
```yaml
path-labels:
  frontend: ["*.js", "*.css", "*.html"]
  backend: ["/app/*"]
```
This config will apply the frontend label when `.js`, `.css` or `.html` files are added/changed/removed,
and will apply the backend label when the same happens to any file in `/app`.

### Labels to apply for branches targeted

The `target-branch-labels` key allows you to apply a label for a target branch.

For example:
```yaml
target-branch-labels:
  experimental: ["experiments"]
```
This config will apply the experiments label when a PR targets the experimental branch. Multiple branches
are possible for one branch.

### Labels to apply for words in PR title

The `title-keyword-labels` allows you to apply a label when a certain word is found in the PR title.

For example:
```yaml
title-keyword-labels:
  in-progress: ["WiP"]
```
This config applies the in-progress label whenever it encounters `WiP` anywhere in the PR title.

### Labels to apply for words in PR description

The `description-keyword-labels` allows you to the same, but then for the PR description.

### Labels to apply for line change counts

The `line-changes-labels` key allows you to give an array of possible conditions for the amount, which
if all apply, apply the label.

Possible conditions are:
- `greater-than`: The count must be greater than the given number.
- `greater-than-equal`: The count must be greater than or equal to the given number.
- `less-than`: The count must be smaller than the given number.
- `less-than-equal`: The count must be smaller than or equal to the given number.

For example:
```yaml
line-changes-labels:
  - greater-than: 300
    less-than-equal: 1000
    label: medium
  - greater-than: 1000
    label: large
```

The label `medium` will be applied if the amount of line changes in the PR is in the range of 301 to 1000.
The label `large` will be applied if the amount of line changes in the PR is 1001 to infinity.

### Labels to apply for line addition counts

The `line-addition-labels` will do the same thing as line changes, but instead only look at the
lines added.

### Labels to apply for line deletion counts

The `line-deletion-labels` will do the same thing as line changes, but instead only look at the
lines deleted.

### Labels to apply for commit counts

The `commit-count-labels` will do the same thing as line changes, but instead it looks at the amount
of commits that are in the PR.

### Labels to apply for authors

The `author-labels` allows you to apply a label when certain developers open a PR.

For example:
```yaml
author-labels:
  master-of-code: ["coder1"]
```
The master-of-code label is applied when coder1 opens a PR.

### Settings

Some settings are configurable under the `settings` key:

- `process-closed-prs`: Boolean. Should the robot do anything with PRs that are closed? Default false.
- `process-merged-prs`: Boolean. Should the robot do anything with PRs that are merged? Default false.
- `remove-labels`: Boolean. Should the robot also remove labels when their triggers are no longer true? Default false.
- `remove-keyword-labels`: Boolean. Should the robot also remove labels triggered by magic keywords when the are no longer found? Default false.

## Setup

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

## Contributing

If you have suggestions for how PR-Labeler could be improved, or want to report a bug, open an issue! We'd love all and any contributions.
