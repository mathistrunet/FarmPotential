// Lanceur Windows de Studio Parcellaire.
//
// Un double-clic suffit : le lanceur retrouve le dossier de l'application,
// installe les dépendances et construit l'interface si nécessaire, démarre le
// serveur local puis ouvre le navigateur. La fenêtre affiche l'avancement et
// arrête proprement le serveur à la fermeture.
//
// Compilation : scripts/build-launcher.ps1 (csc.exe fourni avec Windows,
// aucune dépendance externe).

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace StudioParcellaire
{
    public class LauncherForm : Form
    {
        private const int Port = 4174;
        private static readonly string BaseUrl = "http://localhost:" + Port + "/";

        private readonly TextBox _log;
        private readonly Label _status;
        private readonly Button _openButton;
        private readonly Button _quitButton;

        private string _appRoot;
        private Process _server;
        private bool _ready;

        public LauncherForm()
        {
            Text = "Studio Parcellaire — Lanceur";
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(680, 420);
            MinimumSize = new Size(520, 320);
            Font = new Font("Segoe UI", 9F);
            BackColor = Color.White;

            var title = new Label
            {
                Text = "Studio Parcellaire",
                Font = new Font("Segoe UI", 16F, FontStyle.Bold),
                ForeColor = ColorTranslator.FromHtml("#1F7A4D"),
                AutoSize = true,
                Location = new Point(16, 14)
            };

            _status = new Label
            {
                Text = "Démarrage…",
                AutoSize = false,
                Location = new Point(18, 46),
                Size = new Size(640, 20),
                ForeColor = ColorTranslator.FromHtml("#56606D"),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };

            _log = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Location = new Point(16, 74),
                Size = new Size(648, 286),
                BackColor = ColorTranslator.FromHtml("#F9FAFB"),
                ForeColor = ColorTranslator.FromHtml("#16202C"),
                Font = new Font("Consolas", 8.5F),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom
            };

            _openButton = new Button
            {
                Text = "Ouvrir dans le navigateur",
                Location = new Point(16, 372),
                Size = new Size(200, 32),
                Enabled = false,
                Anchor = AnchorStyles.Left | AnchorStyles.Bottom
            };
            _openButton.Click += (s, e) => OpenBrowser();

            _quitButton = new Button
            {
                Text = "Arrêter et quitter",
                Location = new Point(524, 372),
                Size = new Size(140, 32),
                Anchor = AnchorStyles.Right | AnchorStyles.Bottom
            };
            _quitButton.Click += (s, e) => Close();

            Controls.Add(title);
            Controls.Add(_status);
            Controls.Add(_log);
            Controls.Add(_openButton);
            Controls.Add(_quitButton);

            Shown += async (s, e) => await StartAsync();
            FormClosing += (s, e) => StopServer();
        }

        // ---------------------------------------------------------------- UI

        private void Log(string message)
        {
            if (InvokeRequired) { BeginInvoke((Action)(() => Log(message))); return; }
            _log.AppendText(message + Environment.NewLine);
        }

        private void SetStatus(string message)
        {
            if (InvokeRequired) { BeginInvoke((Action)(() => SetStatus(message))); return; }
            _status.Text = message;
        }

        private void SetReady()
        {
            if (InvokeRequired) { BeginInvoke((Action)SetReady); return; }
            _ready = true;
            _openButton.Enabled = true;
            _status.Text = "Application disponible sur " + BaseUrl;
        }

        private void Fail(string message)
        {
            SetStatus("Échec du démarrage.");
            Log("");
            Log("ERREUR : " + message);
            if (InvokeRequired) { BeginInvoke((Action)(() => ShowError(message))); return; }
            ShowError(message);
        }

        private void ShowError(string message)
        {
            MessageBox.Show(this, message, "Studio Parcellaire", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }

        // ----------------------------------------------------------- Séquence

        private async Task StartAsync()
        {
            try
            {
                _appRoot = FindAppRoot();
                if (_appRoot == null)
                {
                    Fail("Dossier de l'application introuvable.\n\n" +
                         "Placez StudioParcellaire.exe dans le dossier du projet (celui qui contient package.json) " +
                         "ou dans son sous-dossier launcher.");
                    return;
                }
                Log("Dossier de l'application : " + _appRoot);

                if (!await EnsureNodeAsync()) return;
                if (!await EnsureDependenciesAsync()) return;
                if (!await EnsureBuildAsync()) return;
                if (!StartServer()) return;
                if (!await WaitForServerAsync()) return;

                SetReady();
                Log("");
                Log("Application prête sur " + BaseUrl);
                OpenBrowser();
            }
            catch (Exception ex)
            {
                Fail(ex.Message);
            }
        }

        /// Remonte l'arborescence depuis l'exécutable jusqu'à trouver package.json.
        private static string FindAppRoot()
        {
            var directory = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
            for (var i = 0; i < 5 && directory != null; i++)
            {
                if (File.Exists(Path.Combine(directory.FullName, "package.json")) &&
                    File.Exists(Path.Combine(directory.FullName, "scripts", "geojson-server.mjs")))
                {
                    return directory.FullName;
                }
                directory = directory.Parent;
            }
            return null;
        }

        private async Task<bool> EnsureNodeAsync()
        {
            SetStatus("Vérification de Node.js…");
            var version = await RunCaptureAsync("node", "-v");
            if (version == null)
            {
                Fail("Node.js est introuvable sur ce poste.\n\n" +
                     "Installez la version LTS depuis https://nodejs.org puis relancez StudioParcellaire.exe.");
                return false;
            }
            Log("Node.js " + version.Trim());
            return true;
        }

        private async Task<bool> EnsureDependenciesAsync()
        {
            if (Directory.Exists(Path.Combine(_appRoot, "node_modules")))
            {
                Log("Dépendances déjà installées.");
                return true;
            }

            SetStatus("Installation des dépendances (première utilisation, quelques minutes)…");
            Log("");
            Log("> npm install");
            var code = await RunLoggedAsync("npm", "install");
            if (code != 0)
            {
                Fail("L'installation des dépendances a échoué (code " + code + "). " +
                     "Vérifiez votre connexion réseau puis relancez.");
                return false;
            }
            return true;
        }

        private async Task<bool> EnsureBuildAsync()
        {
            var indexFile = Path.Combine(_appRoot, "dist", "index.html");
            if (File.Exists(indexFile) && !SourcesAreNewerThan(indexFile))
            {
                Log("Interface déjà construite et à jour.");
                return true;
            }

            SetStatus("Construction de l'interface…");
            Log("");
            Log("> npm run build");
            var code = await RunLoggedAsync("npm", "run build");
            if (code != 0 || !File.Exists(indexFile))
            {
                Fail("La construction de l'interface a échoué (code " + code + ").");
                return false;
            }
            return true;
        }

        /// Reconstruit si un fichier source est plus récent que le dernier build.
        private bool SourcesAreNewerThan(string builtFile)
        {
            try
            {
                var reference = File.GetLastWriteTimeUtc(builtFile);
                var sourceDir = new DirectoryInfo(Path.Combine(_appRoot, "src"));
                if (!sourceDir.Exists) return false;
                foreach (var file in sourceDir.GetFiles("*", SearchOption.AllDirectories))
                {
                    if (file.LastWriteTimeUtc > reference) return true;
                }
                var indexHtml = new FileInfo(Path.Combine(_appRoot, "index.html"));
                return indexHtml.Exists && indexHtml.LastWriteTimeUtc > reference;
            }
            catch
            {
                return false; // en cas de doute, on ne reconstruit pas inutilement
            }
        }

        private bool StartServer()
        {
            SetStatus("Démarrage du serveur local…");
            Log("");
            Log("> node scripts/geojson-server.mjs");

            var info = new ProcessStartInfo("node", "scripts/geojson-server.mjs")
            {
                WorkingDirectory = _appRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            info.EnvironmentVariables["PORT"] = Port.ToString();

            _server = new Process { StartInfo = info, EnableRaisingEvents = true };
            _server.OutputDataReceived += (s, e) => { if (e.Data != null) Log(e.Data); };
            _server.ErrorDataReceived += (s, e) => { if (e.Data != null) Log(e.Data); };
            _server.Exited += (s, e) =>
            {
                if (_ready) SetStatus("Le serveur s'est arrêté. Fermez puis relancez StudioParcellaire.exe.");
            };

            try
            {
                _server.Start();
                _server.BeginOutputReadLine();
                _server.BeginErrorReadLine();
                return true;
            }
            catch (Exception ex)
            {
                Fail("Impossible de démarrer le serveur local : " + ex.Message);
                return false;
            }
        }

        /// Interroge le serveur jusqu'à ce qu'il réponde (30 s au maximum).
        private async Task<bool> WaitForServerAsync()
        {
            SetStatus("Attente du serveur…");
            for (var attempt = 0; attempt < 60; attempt++)
            {
                if (_server != null && _server.HasExited)
                {
                    Fail("Le serveur local s'est arrêté immédiatement. " +
                         "Le port " + Port + " est peut-être déjà utilisé.");
                    return false;
                }

                try
                {
                    var request = (HttpWebRequest)WebRequest.Create(BaseUrl + "api/parcelles");
                    request.Timeout = 2000;
                    request.Method = "GET";
                    using ((HttpWebResponse)request.GetResponse()) { return true; }
                }
                catch (WebException ex)
                {
                    // Une réponse HTTP, même en erreur, prouve que le serveur écoute.
                    if (ex.Response != null) return true;
                }
                catch
                {
                    // pas encore prêt
                }

                await Task.Delay(500);
            }

            Fail("Le serveur local n'a pas répondu dans le délai imparti.");
            return false;
        }

        private void OpenBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo(BaseUrl) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Log("Ouverture du navigateur impossible : " + ex.Message);
                Log("Ouvrez manuellement l'adresse " + BaseUrl);
            }
        }

        private void StopServer()
        {
            if (_server == null || _server.HasExited) return;
            try
            {
                // taskkill /T ferme aussi les processus enfants éventuels de node.
                var kill = Process.Start(new ProcessStartInfo("taskkill", "/PID " + _server.Id + " /T /F")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true
                });
                if (kill != null) kill.WaitForExit(4000);
            }
            catch
            {
                try { _server.Kill(); } catch { /* déjà arrêté */ }
            }
        }

        // ------------------------------------------------------ Sous-processus

        /// Exécute une commande et renvoie sa sortie standard, ou null si elle échoue.
        private async Task<string> RunCaptureAsync(string fileName, string arguments)
        {
            return await Task.Run(() =>
            {
                try
                {
                    var info = new ProcessStartInfo(fileName, arguments)
                    {
                        WorkingDirectory = _appRoot ?? AppDomain.CurrentDomain.BaseDirectory,
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true
                    };
                    using (var process = Process.Start(info))
                    {
                        var output = process.StandardOutput.ReadToEnd();
                        process.WaitForExit(15000);
                        return process.ExitCode == 0 ? output : null;
                    }
                }
                catch
                {
                    return null;
                }
            });
        }

        /// Exécute npm (via cmd.exe car npm est un script .cmd) en journalisant la sortie.
        private async Task<int> RunLoggedAsync(string command, string arguments)
        {
            var tcs = new TaskCompletionSource<int>();

            var info = new ProcessStartInfo("cmd.exe", "/c " + command + " " + arguments)
            {
                WorkingDirectory = _appRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            var process = new Process { StartInfo = info, EnableRaisingEvents = true };
            process.OutputDataReceived += (s, e) => { if (e.Data != null) Log(e.Data); };
            process.ErrorDataReceived += (s, e) => { if (e.Data != null) Log(e.Data); };
            process.Exited += (s, e) =>
            {
                var code = process.ExitCode;
                process.Dispose();
                tcs.TrySetResult(code);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            return await tcs.Task;
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // Une seule instance : sinon deux serveurs se disputeraient le port.
            bool isNew;
            using (new Mutex(true, "StudioParcellaireLauncher", out isNew))
            {
                if (!isNew)
                {
                    MessageBox.Show(
                        "Studio Parcellaire est déjà en cours d'exécution.",
                        "Studio Parcellaire",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                    return;
                }
                Application.Run(new LauncherForm());
            }
        }
    }
}
