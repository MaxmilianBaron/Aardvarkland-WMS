# GitHub Publishing

Suggested repository name:

```text
MaxmilianBaron/Aardvarkland-WMS-Backend-Frontend-Demo
```

Recommended visibility:

```text
Public
```

Suggested description:

```text
Public Aardvarkland WMS showcase demo for warehouse operations, RF scanning, labels, and integrations.
```

After creating the empty GitHub repository, connect and push:

```powershell
git remote add origin https://github.com/MaxmilianBaron/Aardvarkland-WMS-Backend-Frontend-Demo.git
git branch -M main
git push -u origin main
```

Or run the included helper from this folder:

```powershell
.\scripts\publish-to-github.cmd
```

The helper checks `gh auth status`, opens the GitHub login flow when needed,
creates a public `MaxmilianBaron/Aardvarkland-WMS-Backend-Frontend-Demo` repository, attaches `origin`, and
pushes `main`.

GitHub Pages:

1. Open the repository on GitHub.
2. Go to Settings -> Pages.
3. Select GitHub Actions as the source.
4. Run the included `Deploy static demo to GitHub Pages` workflow.

The site will be served from the Pages URL shown by GitHub after deployment.
