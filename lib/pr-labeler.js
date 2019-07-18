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
    this.log.debug("Full pullrequest", this.pull)

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

    this.labelMilestone(this.config["has-milestone-label"])
    this.labelComments(this.config["has-comments-label"])
    this.labelReviewComments(this.config["has-review-comments-label"])
    this.labelMergeable(this.config["is-mergeable-label"])
    this.labelDraft(this.config["is-draft-label"])

    if ("path-labels" in this.config) {
      await this.labelPaths(this.config["path-labels"])
    }

    if ("target-branch-labels" in this.config) {
      this.labelTargetBranch(this.config["target-branch-labels"])
    }

    if ("title-keyword-labels" in this.config) {
      this.labelKeywords(this.config["title-keyword-labels"], this.pull.title)
    }

    if ("description-keyword-labels" in this.config) {
      this.labelKeywords(this.config["description-keyword-labels"], this.pull.body)
    }

    if ("commit-count-labels" in this.config) {
      this.labelByCount(this.config["commit-count-labels"], this.pull.commits)
    }

    if ("line-changes-labels" in this.config) {
      this.labelByCount(this.config["line-changes-labels"], this.pull.additions+this.pull.deletions)
    }

    if ("line-addition-labels" in this.config) {
      this.labelByCount(this.config["line-addition-labels"], this.pull.additions)
    }

    if ("line-deletion-labels" in this.config) {
      this.labelByCount(this.config["line-deletion-labels"], this.pull.deletions)
    }

    if ("author-labels" in this.config) {
      this.labelAuthor(this.config["author-labels"])
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

  labelMilestone(label) {
    if (!label) {
      return
    }

    this.allLabels.add(label)
    if (this.pull.milestone) {
      this.log.info("Has milestone, applying label", label)
      this.newLabels.add(label)
    }
  }

  labelComments(label) {
    if (!label) {
      return
    }

    this.allLabels.add(label)
    if (this.pull.comments > 0) {
      this.log.info("Has comments, applying label", label)
      this.newLabels.add(label)
    }
  }

  labelReviewComments(label) {
    if (!label) {
      return
    }

    this.allLabels.add(label)
    if (this.pull.review_comments > 0) {
      this.log.info("Has review comments, applying label", label)
      this.newLabels.add(label)
    }
  }

  labelMergeable(label) {
    if (!label) {
      return
    }

    this.allLabels.add(label)
    if (this.pull.mergeable) {
      this.log.info("Is mergeable, applying label", label)
      this.newLabels.add(label)
    }
  }

  labelDraft(label) {
    if (!label) {
      return
    }

    this.allLabels.add(label)
    if (this.pull.draft) {
      this.log.info("Is draft, applying label", label)
      this.newLabels.add(label)
    }
  }

  async labelPaths(pathsConfig) {
    const changedPaths = await this.getAffectedFiles()
    this.log.debug("Changed paths", changedPaths)

    for (const label in pathsConfig) {
      this.allLabels.add(label)

      this.log.debug("Looking for paths", label, pathsConfig[label])
      const matcher = ignore().add(pathsConfig[label])

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

      const branches = this.ensureArray(branchesConfig[label])
      for (const branch of branches) {
        this.log.debug("Checking for target branch", label, branch)

        if (this.pull.base.ref === branch) {
          this.log.debug("Found branch, applying label", label, branch)
          this.newLabels.add(label)
        }
      }
    }
  }

  labelKeywords(keywordsConfig, textToSearch) {
    for (const label in keywordsConfig) {
      // We dont add labels in description to allLabels by default, because then
      // these softmatched labels can be removed randomly on textual changes.
      if (this.settings["remove-keyword-labels"]) {
        this.allLabels.add(label)
      }

      const keywords = this.ensureArray(keywordsConfig[label])
      const normalizedText = normalizeForSearch(textToSearch)
      for (const keyword of keywords) {
        this.log.debug("Checking for keyword", label, keyword)

        if (normalizedText.indexOf(keyword.toLowerCase()) >= 0) {
          this.log.debug("Found keyword, applying label", label, keyword)
          this.newLabels.add(label)
        }
      }
    }
  }

  labelByCount(countConfig, count) {
    for (const config of countConfig) {
      const label = config.label
      if (!label) {
        this.log.warn("No label key found for config", config)
        continue
      }

      this.allLabels.add(label)

      if (config["greater-than"] > 0 && count <= config["greater-than"]) {
        // Its less, so dont apply.
        continue
      }
      if (config["greater-than-equal"] > 0 && count < config["greater-than-equal"]) {
        // Still less.
        continue
      }
      if (config["less-than"] > 0 && count >= config["less-than"]) {
        // Too many, also dont apply.
        continue
      }
      if (config["less-than-equal"] > 0 && count > config["less-than-equal"]) {
        // Still too many.
        continue
      }

      this.log.info("Label matches all count criteria, applying", label, config)
      // If we get here, it means we are good!
      this.newLabels.add(label)
    }
  }

  labelAuthor(authorsConfig) {
    this.log.info("Author is", this.pull.user.login)

    for (const label in authorsConfig) {
      this.allLabels.add(label)

      const authors = this.ensureArray(authorsConfig[label])
      for (const author of authors) {
        this.log.debug("Checking for author", label, author)

        if (this.pull.user.login === author) {
          this.log.debug("Found author, applying label", label, author)
          this.newLabels.add(label)
        }
      }
    }
  }

  ensureArray(val) {
    if (!Array.isArray(val)) {
      return [val]
    }
    return val
  }
}