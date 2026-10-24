// Executável do localia: abre o launcher.ps1 que está na mesma pasta, sem mostrar janela de terminal, e depois
// ajusta o ícone da janela do app na barra de tarefas. Compilado por tools\build-exe.ps1 (o ícone do próprio .exe
// vem de public\localia.ico).
//
// Por que mexer no ícone da janela: o Edge guarda o ícone da página com 16 unidades lógicas e o redimensiona sozinho
// para o tamanho que o Windows pede (20 e 40 px a 125% de escala), o que deixa o desenho borrado. Aqui entregamos à
// janela os quadros exatos do public\localia.ico, desenhados pixel a pixel para cada tamanho.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

static class Localia
{
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);
    [DllImport("user32.dll")] static extern int GetSystemMetricsForDpi(int index, uint dpi);

    const uint WM_SETICON = 0x80, WM_GETICON = 0x7F;
    const int SM_CXICON = 11, SM_CXSMICON = 49;
    const string WindowTitle = "localia";

    static Icon small, big;
    static uint iconDpi;

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
        Process.Start(new ProcessStartInfo
        {
            FileName = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe"),
            Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + launcher + "\"",
            WorkingDirectory = dir,
            UseShellExecute = false,
            CreateNoWindow = true,
        });

        string ico = Path.Combine(dir, "public", "localia.ico");
        if (!File.Exists(ico)) return;
        FixWindowIcon(ico);
    }

    // Espera a janela do app aparecer e mantém os ícones certos nela (o Edge pode trocá-los quando a página termina de
    // carregar). Sai depois de ~25 s com os ícones estáveis, ou em 2 minutos.
    static void FixWindowIcon(string ico)
    {
        var clock = Stopwatch.StartNew();
        int stable = 0;
        while (clock.Elapsed.TotalSeconds < 120 && stable < 25)
        {
            Thread.Sleep(1000);
            IntPtr window = FindAppWindow();
            if (window == IntPtr.Zero) { stable = 0; continue; }
            try { stable = Apply(window, ico) ? stable + 1 : 0; }
            catch { return; }   // ícone ilegível: deixa o Edge como está
        }
    }

    static IntPtr FindAppWindow()
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate (IntPtr h, IntPtr l)
        {
            if (!IsWindowVisible(h)) return true;
            var cls = new StringBuilder(64);
            GetClassName(h, cls, cls.Capacity);
            if (cls.ToString() != "Chrome_WidgetWin_1") return true;
            var title = new StringBuilder(256);
            GetWindowText(h, title, title.Capacity);
            if (title.ToString() != WindowTitle) return true;
            found = h;
            return false;
        }, IntPtr.Zero);
        return found;
    }

    // Devolve true se a janela já tinha os nossos ícones.
    static bool Apply(IntPtr window, string ico)
    {
        uint dpi = GetDpiForWindow(window);
        if (dpi == 0) dpi = 96;
        if (dpi != iconDpi)
        {
            int s = GetSystemMetricsForDpi(SM_CXSMICON, dpi), b = GetSystemMetricsForDpi(SM_CXICON, dpi);
            small = new Icon(ico, s, s);   // escolhe no .ico o quadro do tamanho exato
            big = new Icon(ico, b, b);
            iconDpi = dpi;
        }
        bool already = SendMessage(window, WM_GETICON, (IntPtr)0, IntPtr.Zero) == small.Handle
                    && SendMessage(window, WM_GETICON, (IntPtr)1, IntPtr.Zero) == big.Handle;
        if (!already)
        {
            SendMessage(window, WM_SETICON, (IntPtr)0, small.Handle);
            SendMessage(window, WM_SETICON, (IntPtr)1, big.Handle);
        }
        return already;
    }
}
