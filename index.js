const yaml = require('js-yaml')
const ignore = require('ignore')
const normalizeForSearch = require('normalize-for-search')

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
    const pull = await context.github.pullRequests.get(context.issue())

    app.log.info("Fetched updated pullrequest", pull.data.url)

    if (pull.data.state !== "open") {
      app.log.info("Pull request not open, ignoring", pull.data.state)
      // We dont do anything with PRs that are closed/merged
      return;
    }

    const content = await context.github.repos.getContents(context.repo({
      path: '.github/pr-labeler.yml'
    }))
    const config = yaml.safeLoad(Buffer.from(content.data.content, 'base64').toString())

    app.log.debug("Fetched config", config)

    const files = await context.github.pullRequests.listFiles(context.issue())
    const changedFiles = files.data.map(file => file.filename)

    app.log.debug("Affected files", changedFiles)

    const currentLabels = new Set(pull.data.labels.map((val) => {
      return val.name
    }))
    const addLabels = new Set()
    const allLabels = new Set()

    app.log.debug("Current labels", currentLabels)

    if ("file-path" in config) {
      const filepaths = config["file-path"]

      for (const label in filepaths) {
        allLabels.add(label)

        app.log.debug('Looking for file paths', label, filepaths[label])
        const matcher = ignore().add(filepaths[label])

        if (changedFiles.find(file => matcher.ignores(file))) {
          app.log.info("Found file, applying label", label, filepaths[label])
          addLabels.add(label)
        }
      }
    }

    if ("target-branch" in config) {
      app.log.info("Pullrequest target branch is", pull.data.base.ref)

      for (const label in config["target-branch"]) {
        allLabels.add(label)

        let branches = config["target-branch"][label]
        // Allow non-array values:
        if (!Array.isArray(branches)) {
          branches = [branches]
        }

        for (const branch of branches) {
          app.log.debug('Checking for target branch', label, branch)

          if (pull.data.base.ref === branch) {
            app.log.debug("Found branch", label, branch)
            addLabels.add(label)
          }
        }
      }
    }

    if ("author" in config) {
      app.log.info("Pullrequest author is", pull.data.user.login)

      for (const label in config["author"]) {
        allLabels.add(label)

        let authors = config["author"][label]
        // Allow non-array values:
        if (!Array.isArray(authors)) {
          authors = [authors]
        }

        for (const author of authors) {
          app.log.debug('Checking for author', label, author)

          if (pull.data.user.login === author) {
            app.log.debug("Found author", label, author)
            addLabels.add(label)
          }
        }
      }
    }

    if ("description" in config) {
      for (const label in config["description"]) {
        // We dont add labels in description to allLabels, because the softmatched
        // labels should not be removed.

        let keywords = config["description"][label]
        // Allow non-array values:
        if (!Array.isArray(keywords)) {
          keywords = [keywords]
        }

        const normalizedBody = normalizeForSearch(pull.data.body)
        for (const keyword of keywords) {
          app.log.debug('Checking for keyword', label, keyword)

          if (normalizedBody.indexOf(keyword) >= 0) {
            app.log.debug("Found keyword", label, keyword)
            addLabels.add(label)
          }
        }
      }
    }

    const labelsToRemove = Array.from(allLabels).filter((value) => {
      return !addLabels.has(value) && currentLabels.has(value)
    })

    const labelsToAdd = Array.from(addLabels).filter((value) => {
      return !currentLabels.has(value)
    })

    app.log.info('Adding labels', labelsToAdd)
    if (labelsToAdd.length > 0) {
      context.github.issues.addLabels(context.issue({
        labels: labelsToAdd
      }))
    }

    app.log.info('Removing labels', labelsToRemove)
    if (labelsToRemove.length > 0) {
      for (const label of labelsToRemove) {
        context.github.issues.removeLabel(context.issue({
          name: label
        }))
      }
    }
  }
}
