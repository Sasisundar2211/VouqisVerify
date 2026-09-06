export function ConnectGitHubButton() {
  return (
    <a
      href="/api/github/connect"
      className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
    >
      Connect GitHub repository
    </a>
  );
}
