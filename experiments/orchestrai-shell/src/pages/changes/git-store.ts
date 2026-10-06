import { create } from "zustand"

import { gitFor, STASH, type ChangedFile, type Commit, type StashEntry, type WorktreeGit } from "@/data/git"
import { countLines } from "@/data/git-diffs"
import { WORKTREES, type Worktree } from "@/data/worktrees"
import type { ProjectId } from "@/lib/projects"
import { say } from "@/pages/changes/toast-store"

/** A review note on one diff line, sent to the worktree's agent as part of one message. */
export interface DiffNote {
  id: string
  path: string
  /** `new:12` for a kept or added line, `old:12` for a removed one: the side the note is about. */
  line: string
  body: string
  sent: boolean
}

export interface GitState extends WorktreeGit {
  branch: string
  checked: string[]
  aheadOfBase: number
  behindBase: number
  /** An amend rewrote a commit the upstream already has, so only a force push can land it. */
  diverged: boolean
  notes: DiffNote[]
}

export type DiffMode = "unified" | "split"

interface GitStore {
  states: Record<string, GitState>
  stash: Partial<Record<ProjectId, StashEntry[]>>
  created: Worktree[]
  removed: string[]
  /** `project:branch` for local branches deleted here. */
  deletedBranches: string[]
  diffMode: DiffMode
  update: (id: string, patch: (state: GitState) => Partial<GitState>) => void
  setStash: (project: ProjectId, patch: (entries: StashEntry[]) => StashEntry[]) => void
  createWorktree: (worktree: Worktree, state: GitState) => void
  removeWorktree: (id: string) => void
  setDiffMode: (mode: DiffMode) => void
}

const seeds: Record<string, GitState> = {}

/** The worktree's state as the data files describe it, built once so selectors stay stable. */
export function seedState(worktree: Worktree): GitState {
  if (!seeds[worktree.id]) {
    const git = gitFor(worktree.id)
    seeds[worktree.id] = {
      ...git,
      branch: worktree.branch,
      checked: git.files.map((entry) => entry.path),
      aheadOfBase: git.base ? worktree.ahead : 0,
      behindBase: git.base ? worktree.behind : 0,
      diverged: false,
      notes: [],
    }
  }
  return seeds[worktree.id]
}

function findWorktree(id: string, created: Worktree[]) {
  return WORKTREES.find((entry) => entry.id === id) ?? created.find((entry) => entry.id === id)
}

export const useGitStore = create<GitStore>()((set) => ({
  states: {},
  stash: STASH,
  created: [],
  removed: [],
  deletedBranches: [],
  diffMode: "unified",
  update: (id, patch) =>
    set((store) => {
      const worktree = findWorktree(id, store.created)
      if (!worktree) return {}
      const current = store.states[id] ?? seedState(worktree)
      return { states: { ...store.states, [id]: { ...current, ...patch(current) } } }
    }),
  setStash: (project, patch) => set((store) => ({ stash: { ...store.stash, [project]: patch(store.stash[project] ?? []) } })),
  createWorktree: (worktree, state) => set((store) => ({ created: [...store.created, worktree], states: { ...store.states, [worktree.id]: state } })),
  removeWorktree: (id) => set((store) => ({ removed: [...store.removed, id] })),
  setDiffMode: (diffMode) => set({ diffMode }),
}))

let commits = 0
const shortHash = () => (0x3a91c0 + ++commits * 0x1f3d7).toString(16).slice(0, 7)

/** Bound git operations for one worktree. Every one ends with a line saying what happened. */
export function gitActions(worktree: Worktree, project: ProjectId) {
  const { update, setStash } = useGitStore.getState()
  const id = worktree.id
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`
  const take = (state: GitState, paths: string[]) => state.files.filter((entry) => paths.includes(entry.path))
  const keep = (state: GitState, paths: string[]) => ({
    files: state.files.filter((entry) => !paths.includes(entry.path)),
    checked: state.checked.filter((path) => !paths.includes(path)),
  })
  const merge = (state: GitState, files: ChangedFile[]) => {
    const fresh = files.filter((entry) => !state.files.some((existing) => existing.path === entry.path))
    return { files: [...state.files, ...fresh], checked: [...state.checked, ...fresh.map((entry) => entry.path)] }
  }

  return {
    check: (paths: string[], on: boolean) =>
      update(id, (state) => ({ checked: on ? [...new Set([...state.checked, ...paths])] : state.checked.filter((path) => !paths.includes(path)) })),
    commit: (message: string, amend: boolean) =>
      update(id, (state) => {
        const files = take(state, state.checked).map((entry) => ({ path: entry.path, status: entry.status === "U" ? "A" as const : entry.status }))
        const [subject] = message.split("\n")
        const hash = shortHash()
        const fresh: Commit = { hash, subject, author: "You", time: "Just now", files }
        const rewritesPushed = amend && state.outgoing.length === 0 && Boolean(state.upstream)
        const outgoing = amend && state.outgoing.length ? [{ ...fresh, files: [...state.outgoing[0].files, ...files] }, ...state.outgoing.slice(1)] : [fresh, ...state.outgoing]
        say(amend ? `Amended ${hash} · ${subject}` : `Committed ${hash} · ${plural(files.length, "file")}`)
        return {
          ...keep(state, state.checked),
          outgoing,
          lastCommit: { hash, message },
          aheadOfBase: amend ? state.aheadOfBase : state.aheadOfBase + 1,
          diverged: state.diverged || rewritesPushed,
        }
      }),
    discard: (paths: string[]) =>
      update(id, (state) => {
        say(`Discarded changes in ${plural(paths.length, "file")}`)
        return keep(state, paths)
      }),
    discardHunk: (path: string, index: number) =>
      update(id, (state) => {
        const files = state.files.flatMap((entry) => {
          if (entry.path !== path) return [entry]
          const dropped = countLines([entry.hunks[index]])
          const hunks = entry.hunks.filter((_, position) => position !== index)
          if (!hunks.length) return []
          return [{ ...entry, hunks, additions: entry.additions - dropped.additions, deletions: entry.deletions - dropped.deletions }]
        })
        say(`Discarded one hunk of ${path.split("/").at(-1)}`)
        return { files, checked: state.checked.filter((entry) => files.some((file) => file.path === entry)) }
      }),
    addToGit: (paths: string[]) =>
      update(id, (state) => {
        say(`Added ${plural(paths.length, "file")} to git`)
        return { files: state.files.map((entry) => (paths.includes(entry.path) && entry.status === "U" ? { ...entry, status: "A" as const } : entry)) }
      }),
    ignore: (paths: string[]) =>
      update(id, (state) => {
        say(`Added ${plural(paths.length, "path")} to .gitignore`)
        return keep(state, paths)
      }),
    shelve: (paths: string[], name: string) =>
      update(id, (state) => {
        const label = name.trim() || `Shelved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        say(`Shelved ${plural(paths.length, "file")} as “${label}”`)
        return { ...keep(state, paths), shelf: [{ id: `shelf-${Date.now()}`, name: label, branch: state.branch, created: "Just now", files: take(state, paths) }, ...state.shelf] }
      }),
    unshelve: (entryId: string, drop: boolean) =>
      update(id, (state) => {
        const entry = state.shelf.find((candidate) => candidate.id === entryId)
        if (!entry) return {}
        say(drop ? `Applied and dropped “${entry.name}”` : `Applied “${entry.name}”; it stays on the shelf`)
        return { ...merge(state, entry.files), shelf: drop ? state.shelf.filter((candidate) => candidate.id !== entryId) : state.shelf }
      }),
    dropShelf: (entryId: string) => update(id, (state) => ({ shelf: state.shelf.filter((candidate) => candidate.id !== entryId) })),
    stash: (paths: string[], message: string) => {
      const files = take(useGitStore.getState().states[id] ?? seedState(worktree), paths)
      update(id, (state) => keep(state, paths))
      setStash(project, (entries) => renumber([{ id: "", message: message.trim() || `WIP on ${worktree.branch}`, branch: worktree.branch, created: "Just now", files }, ...entries]))
      say(`Stashed ${plural(paths.length, "file")} · stash@{0}`)
    },
    applyStash: (entry: StashEntry, pop: boolean, only?: string) => {
      update(id, (state) => merge(state, only ? entry.files.filter((candidate) => candidate.path === only) : entry.files))
      if (pop) setStash(project, (entries) => renumber(entries.filter((candidate) => candidate !== entry)))
      say(only ? `Restored ${only.split("/").at(-1)} from ${entry.id}` : pop ? `Popped ${entry.id}` : `Applied ${entry.id}; it stays in the stash`)
    },
    dropStash: (entry: StashEntry) => {
      setStash(project, (entries) => renumber(entries.filter((candidate) => candidate !== entry)))
      say(`Dropped ${entry.id}`)
    },
    push: (force: boolean) =>
      update(id, (state) => {
        const upstream = state.upstream ?? `origin/${state.branch}`
        say(state.outgoing.length ? `${force ? "Force-pushed" : "Pushed"} ${plural(state.outgoing.length, "commit")} to ${upstream}${force ? " (with lease)" : ""}` : `${upstream} is up to date`)
        return { upstream, outgoing: [], diverged: false }
      }),
    pull: () =>
      update(id, (state) => {
        say(state.incoming ? `Pulled ${plural(state.incoming, "commit")} from ${state.upstream} · local changes were stashed and put back` : `${state.branch} is up to date with ${state.upstream}`)
        return { incoming: 0 }
      }),
    rebaseOntoBase: () =>
      update(id, (state) => {
        say(`Rebased ${state.branch} onto ${state.base} · ${plural(state.aheadOfBase, "commit")} replayed`)
        return { behindBase: 0 }
      }),
    mergeBaseIn: () =>
      update(id, (state) => {
        say(`Merged ${state.base} into ${state.branch}`)
        return { behindBase: 0, aheadOfBase: state.aheadOfBase + 1 }
      }),
    renameBranch: (name: string) => update(id, (state) => {
      say(`Renamed ${state.branch} to ${name}`)
      return { branch: name }
    }),
    switchBranch: (name: string) => update(id, () => {
      say(`Switched to ${name}`)
      return { branch: name }
    }),
    deleteBranch: (name: string) => {
      useGitStore.setState((store) => ({ deletedBranches: [...store.deletedBranches, `${project}:${name}`] }))
      say(`Deleted branch ${name}`)
    },
    reclaim: () =>
      update(id, (state) => {
        say(`Freed ${state.size} of build artifacts in ${state.branch}`)
        return { size: "1.1 GB" }
      }),
    addNote: (note: Omit<DiffNote, "id" | "sent">) => update(id, (state) => ({ notes: [...state.notes, { ...note, id: `note-${Date.now()}`, sent: false }] })),
    removeNote: (noteId: string) => update(id, (state) => ({ notes: state.notes.filter((note) => note.id !== noteId) })),
    sendNotes: (agent: string) =>
      update(id, (state) => {
        say(`Sent ${plural(state.notes.length, "note")} to ${agent} as one message`)
        return { notes: state.notes.map((note) => ({ ...note, sent: true })) }
      }),
  }
}

export type GitActions = ReturnType<typeof gitActions>

function renumber(entries: StashEntry[]): StashEntry[] {
  return entries.map((entry, index) => ({ ...entry, id: `stash@{${index}}` }))
}
