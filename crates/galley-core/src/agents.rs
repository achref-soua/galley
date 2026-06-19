//! Pure multi-agent domain types: agent roles, tasks, plans, and the keyword
//! planner that maps a user goal onto an ordered sequence of specialist steps.
//!
//! Nothing here touches the network, filesystem, or LLM runtime — every type
//! and function is testable in isolation and exercised to 100 % coverage by
//! the unit tests at the bottom of this file.

/// A specialist agent role.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentRole {
    /// Plans and sequences the other agents for a given user goal.
    Orchestrator,
    /// Drafts or revises prose and document structure.
    Writer,
    /// Reads compile errors and proposes minimal source fixes.
    CompileFixer,
    /// Looks up and inserts bibliography references.
    CitationLibrarian,
    /// Inserts and formats figures, captions, and TikZ scaffolds.
    FigureWright,
    /// Applies style templates and journal formatting requirements.
    Stylist,
    /// Critiques clarity, consistency, and undefined references.
    Reviewer,
}

impl AgentRole {
    /// A short, human-readable label for the role.
    pub fn label(self) -> &'static str {
        match self {
            Self::Orchestrator => "Orchestrator",
            Self::Writer => "Writer",
            Self::CompileFixer => "CompileFixer",
            Self::CitationLibrarian => "CitationLibrarian",
            Self::FigureWright => "FigureWright",
            Self::Stylist => "Stylist",
            Self::Reviewer => "Reviewer",
        }
    }

    /// The kebab-case identifier used in structured agent markup.
    pub fn id(self) -> &'static str {
        match self {
            Self::Orchestrator => "orchestrator",
            Self::Writer => "writer",
            Self::CompileFixer => "compile-fixer",
            Self::CitationLibrarian => "citation-librarian",
            Self::FigureWright => "figure-wright",
            Self::Stylist => "stylist",
            Self::Reviewer => "reviewer",
        }
    }

    /// Parse a kebab-case `id` string into an `AgentRole`.
    /// Returns `None` for unrecognised values.
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "orchestrator" => Some(Self::Orchestrator),
            "writer" => Some(Self::Writer),
            "compile-fixer" => Some(Self::CompileFixer),
            "citation-librarian" => Some(Self::CitationLibrarian),
            "figure-wright" => Some(Self::FigureWright),
            "stylist" => Some(Self::Stylist),
            "reviewer" => Some(Self::Reviewer),
            _ => None,
        }
    }

    /// The system-prompt paragraph for this role, sent at the start of every
    /// request addressed to it.
    pub fn system_prompt(self) -> &'static str {
        match self {
            Self::Orchestrator => {
                "You are the Galley Orchestrator. Given a user goal and document context, \
                 produce a numbered plan as a list of agent steps. For each step write exactly \
                 one line: [AGENT:<id>] [TASK:<description>] where <id> is one of: writer, \
                 compile-fixer, citation-librarian, figure-wright, stylist, reviewer. \
                 Keep the plan minimal — only include agents that are directly relevant."
            }
            Self::Writer => {
                "You are the Galley Writer agent. Draft or revise LaTeX prose and structure \
                 as instructed. Return every replacement inside a fenced ```latex code block. \
                 Keep changes minimal and preserve surrounding context."
            }
            Self::CompileFixer => {
                "You are the Galley CompileFixer agent. Analyse the compile log and the \
                 failing source, propose a minimal fix, and return the corrected snippet \
                 inside a fenced ```latex code block."
            }
            Self::CitationLibrarian => {
                "You are the Galley CitationLibrarian agent. Insert bibliography references \
                 where directed. When adding \\cite commands, return the updated LaTeX inside \
                 a fenced ```latex code block. When adding BibTeX entries, return them inside \
                 a fenced ```bibtex code block."
            }
            Self::FigureWright => {
                "You are the Galley FigureWright agent. Insert and format figures, captions, \
                 and placement specifiers. Return the figure environment inside a fenced \
                 ```latex code block."
            }
            Self::Stylist => {
                "You are the Galley Stylist agent. Apply the requested style, spacing, or \
                 journal-format requirements to the document. Return every changed block \
                 inside a fenced ```latex code block."
            }
            Self::Reviewer => {
                "You are the Galley Reviewer agent. Critique the document for clarity, \
                 consistency, undefined cross-references, and style issues. Return a concise \
                 bullet-point report. Do not emit code blocks unless proposing a specific fix."
            }
        }
    }
}

/// A single step dispatched to a specialist agent.
#[derive(Debug, Clone, PartialEq)]
pub struct AgentTask {
    /// Which agent should handle this step.
    pub role: AgentRole,
    /// The goal for this specific step.
    pub goal: String,
    /// Additional context the agent needs (e.g. a document excerpt, an error log).
    pub context: String,
}

impl AgentTask {
    /// Construct a task with the given role, goal, and context.
    pub fn new(role: AgentRole, goal: impl Into<String>, context: impl Into<String>) -> Self {
        Self {
            role,
            goal: goal.into(),
            context: context.into(),
        }
    }

    /// Construct a task with no additional context.
    pub fn simple(role: AgentRole, goal: impl Into<String>) -> Self {
        Self::new(role, goal, "")
    }
}

/// An ordered plan produced by the Orchestrator for a user goal.
#[derive(Debug, Clone, PartialEq)]
pub struct AgentPlan {
    /// The original user goal.
    pub goal: String,
    /// Ordered sequence of specialist steps.
    pub steps: Vec<AgentTask>,
}

impl AgentPlan {
    /// Construct a plan from a goal string and a list of steps.
    pub fn new(goal: impl Into<String>, steps: Vec<AgentTask>) -> Self {
        Self {
            goal: goal.into(),
            steps,
        }
    }

    /// Whether the plan contains any steps.
    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }

    /// The number of steps in the plan.
    pub fn len(&self) -> usize {
        self.steps.len()
    }
}

/// Build a keyword-based plan for `goal` without contacting an LLM.
///
/// This pure planner is used as the fallback / browser-backend path; in the
/// packaged app the Orchestrator agent refines it via an LLM call. The
/// heuristic is intentionally simple: it inspects the lowercased goal and
/// adds agents that are clearly relevant.
pub fn plan_goal(goal: &str) -> AgentPlan {
    let lower = goal.to_lowercase();
    let mut steps: Vec<AgentTask> = Vec::new();

    // Compile errors always need the fixer first.
    if lower.contains("error") || lower.contains("fix") || lower.contains("compile") {
        steps.push(AgentTask::simple(AgentRole::CompileFixer, goal));
    }

    // Reference / citation work.
    if lower.contains("citation")
        || lower.contains("cite")
        || lower.contains("reference")
        || lower.contains("bibliography")
        || lower.contains("bib")
    {
        steps.push(AgentTask::simple(AgentRole::CitationLibrarian, goal));
    }

    // Figure insertion.
    if lower.contains("figure")
        || lower.contains("image")
        || lower.contains("tikz")
        || lower.contains("plot")
        || lower.contains("diagram")
    {
        steps.push(AgentTask::simple(AgentRole::FigureWright, goal));
    }

    // Style / formatting.
    if lower.contains("style")
        || lower.contains("format")
        || lower.contains("layout")
        || lower.contains("spacing")
        || lower.contains("journal")
        || lower.contains("template")
    {
        steps.push(AgentTask::simple(AgentRole::Stylist, goal));
    }

    // Writing / prose (also the default when nothing else matched).
    if lower.contains("write")
        || lower.contains("paragraph")
        || lower.contains("section")
        || lower.contains("draft")
        || lower.contains("add")
        || lower.contains("revise")
        || lower.contains("rewrite")
        || steps.is_empty()
    {
        steps.push(AgentTask::simple(AgentRole::Writer, goal));
    }

    // Review is requested explicitly or appended when the goal asks for feedback.
    if lower.contains("review")
        || lower.contains("check")
        || lower.contains("critique")
        || lower.contains("proofread")
    {
        steps.push(AgentTask::simple(AgentRole::Reviewer, goal));
    }

    AgentPlan::new(goal, steps)
}

/// Parse an LLM Orchestrator response into a list of `(AgentRole, task)` pairs.
///
/// Expects lines of the form `[AGENT:<id>] [TASK:<description>]`.
/// Lines that do not match (or carry an unrecognised agent id) are silently
/// skipped, making the parser forward-compatible.
pub fn parse_plan_response(response: &str) -> Vec<(AgentRole, String)> {
    let mut out = Vec::new();
    for line in response.lines() {
        let line = line.trim();
        // Expect both markers on one line.
        let Some(agent_start) = line.find("[AGENT:") else {
            continue;
        };
        let Some(agent_end) = line[agent_start..].find(']') else {
            continue;
        };
        let agent_id = &line[agent_start + 7..agent_start + agent_end];
        let Some(role) = AgentRole::parse(agent_id) else {
            continue;
        };
        let Some(task_start) = line.find("[TASK:") else {
            continue;
        };
        let Some(task_end) = line[task_start..].find(']') else {
            continue;
        };
        let task = line[task_start + 6..task_start + task_end]
            .trim()
            .to_string();
        if !task.is_empty() {
            out.push((role, task));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── AgentRole ─────────────────────────────────────────────────────────────

    #[test]
    fn agent_role_label_is_non_empty_for_all_variants() {
        for role in all_roles() {
            assert!(!role.label().is_empty(), "{role:?} label is empty");
        }
    }

    #[test]
    fn agent_role_id_round_trips_through_parse() {
        for role in all_roles() {
            assert_eq!(
                AgentRole::parse(role.id()),
                Some(role),
                "round-trip failed for {role:?}"
            );
        }
    }

    #[test]
    fn agent_role_parse_unknown_returns_none() {
        assert_eq!(AgentRole::parse(""), None);
        assert_eq!(AgentRole::parse("unknown"), None);
        assert_eq!(AgentRole::parse("Writer"), None); // case-sensitive
    }

    #[test]
    fn agent_role_system_prompt_is_non_empty_for_all_variants() {
        for role in all_roles() {
            assert!(
                !role.system_prompt().is_empty(),
                "{role:?} system_prompt is empty"
            );
        }
    }

    #[test]
    fn agent_role_debug_eq_copy() {
        let a = AgentRole::Writer;
        let b = a;
        assert_eq!(a, b);
        assert_ne!(a, AgentRole::Reviewer);
        assert!(format!("{a:?}").contains("Writer"));
    }

    // ── AgentTask ─────────────────────────────────────────────────────────────

    #[test]
    fn agent_task_new_stores_fields() {
        let t = AgentTask::new(AgentRole::Writer, "draft intro", "some context");
        assert_eq!(t.role, AgentRole::Writer);
        assert_eq!(t.goal, "draft intro");
        assert_eq!(t.context, "some context");
    }

    #[test]
    fn agent_task_simple_has_empty_context() {
        let t = AgentTask::simple(AgentRole::Reviewer, "check refs");
        assert_eq!(t.role, AgentRole::Reviewer);
        assert_eq!(t.goal, "check refs");
        assert!(t.context.is_empty());
    }

    #[test]
    fn agent_task_eq_clone_debug() {
        let a = AgentTask::new(AgentRole::Stylist, "format", "ctx");
        let b = a.clone();
        assert_eq!(a, b);
        assert_ne!(a, AgentTask::new(AgentRole::Writer, "format", "ctx"));
        assert!(format!("{a:?}").contains("AgentTask"));
    }

    // ── AgentPlan ─────────────────────────────────────────────────────────────

    #[test]
    fn agent_plan_new_stores_goal_and_steps() {
        let steps = vec![AgentTask::simple(AgentRole::Writer, "g1")];
        let p = AgentPlan::new("my goal", steps.clone());
        assert_eq!(p.goal, "my goal");
        assert_eq!(p.steps, steps);
    }

    #[test]
    fn agent_plan_len_and_is_empty() {
        let empty = AgentPlan::new("x", vec![]);
        assert!(empty.is_empty());
        assert_eq!(empty.len(), 0);

        let one = AgentPlan::new("x", vec![AgentTask::simple(AgentRole::Writer, "g")]);
        assert!(!one.is_empty());
        assert_eq!(one.len(), 1);
    }

    #[test]
    fn agent_plan_eq_clone_debug() {
        let p = AgentPlan::new("g", vec![AgentTask::simple(AgentRole::Reviewer, "r")]);
        let q = p.clone();
        assert_eq!(p, q);
        assert!(format!("{p:?}").contains("AgentPlan"));
    }

    // ── plan_goal ─────────────────────────────────────────────────────────────

    #[test]
    fn plan_goal_fix_error_triggers_compile_fixer() {
        let plan = plan_goal("fix compile error");
        assert!(plan.steps.iter().any(|s| s.role == AgentRole::CompileFixer));
    }

    #[test]
    fn plan_goal_citation_triggers_citation_librarian() {
        let plan = plan_goal("add 3 citations to related work");
        assert!(plan
            .steps
            .iter()
            .any(|s| s.role == AgentRole::CitationLibrarian));
    }

    #[test]
    fn plan_goal_bibliography_triggers_citation_librarian() {
        let plan = plan_goal("update bibliography entries");
        assert!(plan
            .steps
            .iter()
            .any(|s| s.role == AgentRole::CitationLibrarian));
    }

    #[test]
    fn plan_goal_figure_triggers_figure_wright() {
        let plan = plan_goal("insert a diagram");
        assert!(plan.steps.iter().any(|s| s.role == AgentRole::FigureWright));
    }

    #[test]
    fn plan_goal_style_triggers_stylist() {
        let plan = plan_goal("apply IEEE journal formatting");
        assert!(plan.steps.iter().any(|s| s.role == AgentRole::Stylist));
    }

    #[test]
    fn plan_goal_write_triggers_writer() {
        let plan = plan_goal("write an introduction section");
        assert!(plan.steps.iter().any(|s| s.role == AgentRole::Writer));
    }

    #[test]
    fn plan_goal_review_triggers_reviewer() {
        let plan = plan_goal("review the document");
        assert!(plan.steps.iter().any(|s| s.role == AgentRole::Reviewer));
    }

    #[test]
    fn plan_goal_unknown_falls_back_to_writer() {
        let plan = plan_goal("do something vague");
        assert!(!plan.is_empty());
        assert!(plan.steps.iter().any(|s| s.role == AgentRole::Writer));
    }

    #[test]
    fn plan_goal_skips_writer_when_steps_already_present_and_no_write_keywords() {
        // "fix" triggers CompileFixer, "review" triggers Reviewer,
        // but none of the Writer keywords are present, so steps.is_empty() → false
        // and the Writer branch is skipped.
        let plan = plan_goal("fix the errors and review");
        assert!(plan.steps.iter().any(|s| s.role == AgentRole::CompileFixer));
        assert!(plan.steps.iter().any(|s| s.role == AgentRole::Reviewer));
        assert!(!plan.steps.iter().any(|s| s.role == AgentRole::Writer));
    }

    #[test]
    fn plan_goal_preserves_original_goal_string() {
        let goal = "add a related-work paragraph with 3 real citations and make it compile";
        let plan = plan_goal(goal);
        assert_eq!(plan.goal, goal);
    }

    #[test]
    fn plan_goal_combined_triggers_multiple_agents() {
        let plan = plan_goal("add cited figures and fix any compile errors");
        let roles: Vec<AgentRole> = plan.steps.iter().map(|s| s.role).collect();
        assert!(roles.contains(&AgentRole::CompileFixer));
        assert!(roles.contains(&AgentRole::CitationLibrarian));
        assert!(roles.contains(&AgentRole::FigureWright));
    }

    // ── parse_plan_response ───────────────────────────────────────────────────

    #[test]
    fn parse_plan_response_extracts_agent_task_pairs() {
        let resp = "\
            1. [AGENT:writer] [TASK:draft the related-work section]\n\
            2. [AGENT:citation-librarian] [TASK:insert 3 citations]\n\
            3. [AGENT:compile-fixer] [TASK:fix any remaining errors]";
        let pairs = parse_plan_response(resp);
        assert_eq!(pairs.len(), 3);
        assert_eq!(
            pairs[0],
            (AgentRole::Writer, "draft the related-work section".into())
        );
        assert_eq!(
            pairs[1],
            (AgentRole::CitationLibrarian, "insert 3 citations".into())
        );
        assert_eq!(
            pairs[2],
            (AgentRole::CompileFixer, "fix any remaining errors".into())
        );
    }

    #[test]
    fn parse_plan_response_skips_unknown_agent_ids() {
        let resp = "[AGENT:unknown-bot] [TASK:do stuff]\n[AGENT:reviewer] [TASK:check it]";
        let pairs = parse_plan_response(resp);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].0, AgentRole::Reviewer);
    }

    #[test]
    fn parse_plan_response_skips_lines_missing_agent_marker() {
        let resp = "Just a normal sentence.\n[AGENT:writer] [TASK:draft intro]";
        let pairs = parse_plan_response(resp);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].0, AgentRole::Writer);
    }

    #[test]
    fn parse_plan_response_skips_lines_missing_task_marker() {
        let resp = "[AGENT:stylist] no task here\n[AGENT:stylist] [TASK:apply ieee]";
        let pairs = parse_plan_response(resp);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].1, "apply ieee");
    }

    #[test]
    fn parse_plan_response_skips_lines_with_unclosed_agent_bracket() {
        // No ']' exists anywhere after '[AGENT:' — find(']') returns None.
        let resp = "[AGENT:writer no close bracket\n[AGENT:reviewer] [TASK:check]";
        let pairs = parse_plan_response(resp);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].0, AgentRole::Reviewer);
    }

    #[test]
    fn parse_plan_response_skips_lines_with_unclosed_task_bracket() {
        let resp = "[AGENT:writer] [TASK:draft\n[AGENT:reviewer] [TASK:check]";
        let pairs = parse_plan_response(resp);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].0, AgentRole::Reviewer);
    }

    #[test]
    fn parse_plan_response_skips_empty_task_description() {
        let resp = "[AGENT:writer] [TASK:]\n[AGENT:reviewer] [TASK:check refs]";
        let pairs = parse_plan_response(resp);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].0, AgentRole::Reviewer);
    }

    #[test]
    fn parse_plan_response_returns_empty_for_empty_input() {
        let pairs = parse_plan_response("");
        assert!(pairs.is_empty());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    fn all_roles() -> [AgentRole; 7] {
        [
            AgentRole::Orchestrator,
            AgentRole::Writer,
            AgentRole::CompileFixer,
            AgentRole::CitationLibrarian,
            AgentRole::FigureWright,
            AgentRole::Stylist,
            AgentRole::Reviewer,
        ]
    }
}
