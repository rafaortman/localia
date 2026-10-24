// Executável do localia: abre o launcher.ps1 que está na mesma pasta, sem mostrar janela de terminal.
// Compilado por tools\build-exe.ps1 (o ícone vem de public\localia.ico).
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class Localia
{
    [STAThread]
    static void Main()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string launcher = Path.Combine(dir, "launcher.ps1");
        if (!File.Exists(launcher))
        {
            MessageBox.Show("Não encontrei o launcher.ps1 ao lado deste arquivo:\n" + dir, "localia", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        var info = new ProcessStartInfo
        {
            FileName = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe"),
            Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + launcher + "\"",
            WorkingDirectory = dir,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        Process.Start(info);
    }
}
