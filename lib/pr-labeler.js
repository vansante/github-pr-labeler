const yaml = require('js-yaml')
const ignore = require('ignore')
const normalizeForSearch = require('normalize-for-search')

module.exports = class PullRequestLabeler {
  constructor (context, log) {
    this.log = log
    this.context = context
    this.config = {}
    this.settings = {}
  }

  async init() {
    this.pull = await this.getPr()
    this.log.info("Fetched pullrequest", this.pull.url)

    this.config = await this.getConfig()
    this.log.info("Fetched config", this.config)

    if ("settings" in this.config) {
      this.settings = this.config["settings"]
    }
  }

  async getPr() {
    const pull = await this.context.github.pullRequests.get(this.context.issue())
    return pull.data
  }

  async getConfig() {
    const content = await this.context.github.repos.getContents(this.context.repo({
      path: '.github/pr-labeler.yml'
    }))
    return yaml.safeLoad(Buffer.from(content.data.content, 'base64').toString())
  }

  async getAffectedFiles() {
    const files = await this.context.github.pullRequests.listFiles(this.context.issue())
    return files.data.map(file => file.filename)
  }

  async label() {
    this.currentLabels = new Set(this.pull.labels.map((val) => {
      return val.name
    }))
    this.log.debug("Current labels", this.currentLabels)

    this.newLabels = new Set()
    this.allLabels = new Set()

    switch (this.pull.state) {
      case "closed":
        if (!this.settings["process-closed-prs"]) {
          this.log.info("Pull request is closed, ignoring")
          return false
        }
        break
      case "merged":
        if (!this.settings["process-merged-prs"]) {
          this.log.info("Pull request is merged, ignoring")
          return false
        }
        break
    }

    if ("path-labels" in this.config) {
      await this.labelPaths(this.config["path-labels"])
    }

    if ("target-branch-labels" in this.config) {
      this.labelTargetBranch(this.config["target-branch-labels"])
    }

    if ("pr-description-keyword-labels" in this.config) {
      this.labelPrDescription(this.config["pr-description-keyword-labels"])
    }

    if ("pr-author-labels" in this.config) {
      this.labelPrAuthor(this.config["pr-author-labels"])
    }

    // Calculate labels to remove by taking all labels and removing the new labels
    // and keeping the current labels
    const labelsToRemove = Array.from(this.allLabels).filter((value) => {
      return !this.newLabels.has(value) && this.currentLabels.has(value)
    })

    // Calculate labels to add by taking the new labels and filtering the ones we
    // already have
    const labelsToAdd = Array.from(this.newLabels).filter((value) => {
      return !this.currentLabels.has(value)
    })

    if (labelsToAdd.length > 0) {
      this.log.info("Adding labels", labelsToAdd)
      this.context.github.issues.addLabels(this.context.issue({
        labels: labelsToAdd
      }))
    } else {
      this.log.info("No labels to add")
    }

    if (this.settings["remove-labels"]) {
      if (labelsToRemove.length > 0) {
        this.log.info("Removing labels", labelsToRemove)
        for (const label of labelsToRemove) {
          this.context.github.issues.removeLabel(this.context.issue({
            name: label
          }))
        }
      } else {
        this.log.info("No labels to remove")
      }
    } else {
      this.log.debug("Would have removed these labels", labelsToRemove)
    }

    return true
  }

  async labelPaths(pathsConfig) {
    const changedPaths = await this.getAffectedFiles()

    for (const label in pathsConfig) {
      this.allLabels.add(label)

      this.log.debug("Looking for paths", label, pathsConfig[label])
      const matcher = ignore().add(paths[label])

      if (changedPaths.find(path => matcher.ignores(path))) {
        this.log.info("Found path, applying label", label, pathsConfig[label])
        this.newLabels.add(label)
      }
    }
  }

  labelTargetBranch(branchesConfig) {
    this.log.info("Target branch is", this.pull.base.ref)

    for (const label in branchesConfig) {
      this.allLabels.add(label)

      let branches = branchesConfig[label]
      // Allow non-array values:
      if (!Array.isArray(branches)) {
        branches = [branches]
      }

      for (const branch of branches) {
        this.log.debug("Checking for target branch", label, branch)

        if (this.pull.base.ref === branch) {
          this.log.debug("Found branch", label, branch)
          this.newLabels.add(label)
        }
      }
    }
  }

  labelPrDescription(keywordsConfig) {
    for (const label in keywordsConfig) {
      // We dont add labels in description to allLabels by default, because then
      // these softmatched labels can be removed randomly on description changes.
      if (this.settings["remove-keyword-labels"]) {
        this.allLabels.add(label)
      }

      let keywords = keywordsConfig[label]
      // Allow non-array values:
      if (!Array.isArray(keywords)) {
        keywords = [keywords]
      }

      const normalizedBody = normalizeForSearch(this.pull.body)
      for (const keyword of keywords) {
        this.log.debug("Checking for keyword", label, keyword)

        if (normalizedBody.indexOf(keyword) >= 0) {
          this.log.debug("Found keyword, applying label", label, keyword)
          this.addLabels.add(label)
        }
      }
    }
  }

  labelPrAuthor(authorsConfig) {
    for (const label in authorsConfig) {
      this.allLabels.add(label)

      let authors = authorsConfig[label]
      // Allow non-array values:
      if (!Array.isArray(authors)) {
        authors = [authors]
      }

      for (const author of authors) {
        this.log.debug("Checking for author", label, author)

        if (this.pull.user.login === author) {
          this.log.debug("Found author, applying label", label, author)
          this.newLabels.add(label)
        }
      }
    }
  }
}