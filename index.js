const Labeler = require("./lib/pr-labeler")

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} app
 */
module.exports = app => {
  // Your code here
  app.log.info('Loaded the PR-labeler')

  app.on('pull_request.opened', label)
  app.on('pull_request.edited', label)
  app.on('pull_request.synchronize', label)

  async function label(context) {
    // Create a PullRequestLabeler
    const labeler = new Labeler(context, app.log)

    // Fetch some PR info
    await labeler.init()

    // Do the labeling!
    await labeler.label()
  }
}
