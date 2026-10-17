# Library research for feature planning

Launch a read-only subagent before settling the feature's implementation approach. Give it the
requirements, existing dependencies, runtime constraints, and the criteria below.

- Prefer established, well-used open-source repositories and projects. Verify adoption through
  real downstream use or ecosystem evidence, alongside maintenance, compatibility, and licensing;
  star counts alone do not establish suitability.
- For a very niche requirement, consider less widely used projects that closely match it.
  Explain the fit and the adoption or maintenance limitations behind that exception.
- Return multiple suitable recommendations when available, with current links to the projects
  and supporting evidence. Compare requirement coverage and integration cost, then recommend
  which option to use and why. Do not fill the comparison with unsuitable alternatives; report
  when existing dependencies or a local implementation are the better choice.
- Research does not authorize installation or updates. Bring proposed dependency changes to the
  developer under the root approval policy, preferably while planning; a useful discovery during
  implementation can be proposed then.
