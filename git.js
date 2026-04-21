#!/usr/bin/env node
import { execSync } from "node:child_process";

function sh(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function shOut(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

const eventName = process.env.EVENT_NAME;
const schedule = process.env.EVENT_SCHEDULE;
const repository = process.env.GITHUB_REPOSITORY;

// Configure Git identity
sh(`git config user.name "github-actions[bot]"`);
sh(`git config user.email "github-actions[bot]@users.noreply.github.com"`);

const TEMPLATE_URL = "https://github.com/catholicweb/subtree.git";
const SUBTREE_PREFIX = "docs/.vitepress";
const ROOT_MIRROR = `${SUBTREE_PREFIX}/_root`;

export function fetchUpstream() {
  if (schedule !== "0 3 * * *" && eventName !== "workflow_dispatch") {
    return console.log("Not the right time to fetch...", schedule, eventName);
  }
  console.log("Syncing template via git subtree...");

  sh(`git remote add template ${TEMPLATE_URL} || true`);
  sh(`git fetch template main`);

  // Check whether the subtree has already been initialized.
  // git subtree annotates its squash merge commits with "git-subtree-dir:".
  const hasSubtree = shOut(
    `git log --format=%B --all | grep "git-subtree-dir: ${SUBTREE_PREFIX}"`
  );

  if (!hasSubtree) {
    console.log("First run: initializing subtree...");
    // Remove .vitepress from the git index (keep working-tree files intact)
    // so git subtree add can take ownership of the prefix.
    sh(`git rm -r --cached ${SUBTREE_PREFIX}/`);
    sh(`rm -rf ${SUBTREE_PREFIX}`);  // force remove from disk regardless
    sh(`git commit -m "chore: untrack .vitepress for subtree migration"`);
    sh(`git subtree add --prefix=${SUBTREE_PREFIX} template main --squash -m "chore: initialize template subtree"`);
  } else {
    sh(`git subtree pull --prefix=${SUBTREE_PREFIX} template main --squash -m "Sync template" || true`);
  }

  // Mirror all files inside _root/ to the repo root, preserving directory structure.
  // To add a new shared file, just drop it into docs/.vitepress/_root/ in web-template.
  sh(`\cp -rf ${ROOT_MIRROR}/. . 2>/dev/null || true`);

  // Stage whatever changed (working tree is clean after subtree pull, so only
  // the files just copied can be dirty).
  sh(`git add . 2>/dev/null || true`);
  sh(`git diff --cached --quiet || git commit -m "Sync template root files"`);

  sh(`git push origin main`);
  console.log("Sync complete.");
}

export function commit() {
  if (!repository) return;
  sh(`git add . || true`);
  sh(`git commit -m "commit so far" || true`);
  sh(`git push origin main`);
}
