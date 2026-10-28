/**
 * Synthetic logcat excerpts for the parser tests. Every value is invented (dates in 2026-01, pid 1200, version
 * QA_9.9.9, STAN 000123, card ************0001); the line shapes match what the PAX terminal produces. Kept as code so
 * that no log file lives in the repository. Tests assert exact 0-based line numbers, so do not reorder lines.
 */

/** One boot, one app process: logon, approved purchase with receipt, ECR-initiated declined purchase, cancelled
 * purchase, a purchase cut short by a crash, a crash of another package, and one line of the sibling build. */
export const BASIC_LOG = String.raw`[2026-01-05 09:00:00].100 W/ActivityManager(  600): Start proc 1200:com.xcr.singleapp.wpay/u0a101 for activity {com.xcr.singleapp.wpay/cloudBanking.singlePaymentApp.MainActivity}
[2026-01-05 09:00:00].200 W/.singleapp.wpa( 1200): Using default instruction set features for ARM CPU variant (generic) using conservative defaults
[2026-01-05 09:00:01].000 W/XWARN   ( 1200): vQA_9.9.9 MainShellActivity.cs:82 Power Failure: fAutoStart = False
[2026-01-05 09:00:01].500 W/LOGF    ( 1200): |..\Gateway.c:462 | LoadGatewayLibrary ----
[2026-01-05 09:00:02].000 W/PAYMENTAPP_DIALOG( 1200): CloudBanking.UI.LogonDialog
[2026-01-05 09:00:02].500 W/XWARN   ( 1200): vQA_9.9.9 Processors.cs:252 PCE_LOGON_STARTED
[2026-01-05 09:00:03].000 E/XERROR  ( 1200): vQA_9.9.9 DroidUtilityService.cs:271 System.Threading.Tasks.TaskCanceledException: A task was canceled.	   at System.Threading.Tasks.Task.GetExceptions
[2026-01-05 09:00:03].100 E/XERROR  ( 1200): vQA_9.9.9 BaseApplication.cs:120 UnhandledExceptionHandler:    at CloudBanking.SinglePaymentApp.MainActivity.StartApplicationAsync()
[2026-01-05 09:00:03].200 W/System.err( 1200): java.lang.IllegalStateException: -121
[2026-01-05 09:00:03].200 W/System.err( 1200): 	at android.os.Parcel.createException(Parcel.java:2102)
[2026-01-05 09:00:03].200 W/System.err( 1200): 	at android.os.Parcel.readException(Parcel.java:2062)
[2026-01-05 09:00:03].300 E/Neptune ( 1200): CatchException: com.pax.api.MiscException: Switch not open error
[2026-01-05 09:00:03].400 E/lowmemorykiller(  412): Kill ignore 'com.xcr.singleapp.wpay' (1200), uid 10101, oom_adj 700 in white list to still hold 208300kB
[2026-01-05 09:00:05].000 W/PAYMENTAPP_DIALOG( 1200): CloudBanking.UI.SelectFunctionDialog
[2026-01-05 09:00:06].000 W/XWARN   ( 1200): vQA_9.9.9 ShellClient.cs:208 [FBTRACE] ShellClient: transaction start | merchant=1 eftProcessor=libWPAY function=Purchase amount=1250
[2026-01-05 09:00:06].100 W/PAYMENTAPP_DIALOG( 1200): CloudBanking.ShellUI.RequestCardDialog
[2026-01-05 09:00:07].000 W/XWARN   ( 1200): vQA_9.9.9 PaxSmartDevice.cs:2037 Entry Mode: EM_CONTACTLESS_ISO
[2026-01-05 09:00:07].100 W/XWARN   ( 1200): vQA_9.9.9 EmvFlow.cs:127 Scheme Card: VISA CARD
[2026-01-05 09:00:07].200 W/XWARN   ( 1200): vQA_9.9.9 RequestCard.cs:2129 PCE_CARD_DATA:CEM=c:T1<redacted,length=0>:T2<redacted,length=37>:T3<redacted,length=0>
[2026-01-05 09:00:07].300 W/XWARN   ( 1200): vQA_9.9.9 AccountType.cs:34 PCE_ACCOUNT_SELECTED=CRD
[2026-01-05 09:00:08].000 W/XWARN   ( 1200): vQA_9.9.9 Process.cs:62 [FBTRACE] send: calling ProcessNormalFunction | merchant=1 eftProcessor=libWPAY
[2026-01-05 09:00:08].100 W/LOGF    ( 1200): |..\SSLEndPoint.cpp:360 | RecvMessage ssl ---
[2026-01-05 09:00:08].150 W/LOGF    ( 1200): |..\TCP.cpp:69 | PC-EFTPOS TX payload (App->POS) ASCII: Z0.vQA_9.9.9 Process.cs:62 [FBTRACE] send: calling ProcessNormalFunction | merchant=1 eftProcessor=libWPAY
[2026-01-05 09:00:08].160 W/LOGF    ( 1200): |..\TCP.cpp:69 | PC-EFTPOS RX payload (POS->App) ASCII: K0
[2026-01-05 09:00:10].000 W/XWARN   ( 1200): vQA_9.9.9 Process.cs:62 [FBTRACE] send: ProcessNormalFunction returned | merchant=1 resultCode=0
[2026-01-05 09:00:10].100 W/XINFOR  ( 1200): vQA_9.9.9 Process.cs:1866 [CDO] EMV complete returned: iEMVResult=0 iResultCode=0 responseCode=00 fChipDecisionOverride=False
[2026-01-05 09:00:11].000 W/PAYMENTAPP_DIALOG( 1200): CloudBanking.ShellUI.ApprovalDialog
[2026-01-05 09:00:12].000 W/LOGF    ( 1200): |..\Printing.cpp:3345 | Start GatewayPrinting ----- function: 10
[2026-01-05 09:00:12].100 W/XINFOR  ( 1200): vQA_9.9.9 Printing.cs:285 PrintDualTextCallback: L: STAN R: 000123
[2026-01-05 09:00:12].110 W/XINFOR  ( 1200): vQA_9.9.9 Printing.cs:285 PrintDualTextCallback: L: RRN R: 000000000123
[2026-01-05 09:00:12].120 W/XINFOR  ( 1200): vQA_9.9.9 Printing.cs:285 PrintDualTextCallback: L: CARD: R: ************0001 (C)
[2026-01-05 09:00:12].130 W/XINFOR  ( 1200): vQA_9.9.9 Printing.cs:285 PrintDualTextCallback: L: PURCHASE R: AU$ 12.50
[2026-01-05 09:00:12].140 W/XINFOR  ( 1200): vQA_9.9.9 Printing.cs:285 PrintDualTextCallback: L: TOTAL AUD R: AU$ 12.50
[2026-01-05 09:00:12].150 W/XINFOR  ( 1200): vQA_9.9.9 Printing.cs:285 PrintDualTextCallback: L: APPROVED R: 00
[2026-01-05 09:00:13].100 W/XINFOR  ( 1200): vQA_9.9.9 Printing.cs:285 PrintDualTextCallback: L: STAN R: 000999
[2026-01-05 09:00:13].150 W/XINFOR  ( 1200): vQA_9.9.9 Printing.cs:285 PrintDualTextCallback: L: APPROVED R: 00
[2026-01-05 09:00:14].000 W/XWARN   ( 1200): vQA_9.9.9 ShellClient.cs:223 [FBTRACE] ShellClient: ProcessTrans returned | merchant=1 usResult=0 retryProcessorChanged=False
[2026-01-05 09:00:14].100 W/XWARN   ( 1200): vQA_9.9.9 ShellClient.cs:259 [FBTRACE] ShellClient: transaction completed | merchant=1 usResult=0 currentItem=none (Primary) recordingAsSaf=False
[2026-01-05 09:00:14].500 W/TRANS_STEP_TRACE( 1200): [0123456789abcdef0123456789abcdef] Index: 1, time: 09:00:14, entry mode: ctls, reading card: 0.6s, processing to host: 2.0s, db duration: 245.0ms, render receipts : {0.2, 0.2}, showing approval: 0.3s, card: , app Memory: 150.0MB, app Memory with shared: 200.0MB, device free Memory: 400MB
[2026-01-05 09:00:14].600 W/XWARN   ( 1200): vQA_9.9.9 ShellClient.cs:328 [FBTRACE] ShellClient: transaction end | merchant=1 stateItemId=0 restoreProcessorName=YES -> libWPAY
[2026-01-05 09:01:00].000 W/XWARN   ( 1200): vQA_9.9.9 ECRAppilcationFlow.cs:549 FUNCTION=Purchase
[2026-01-05 09:01:01].000 W/XWARN   ( 1200): vQA_9.9.9 ShellClient.cs:208 [FBTRACE] ShellClient: transaction start | merchant=1 eftProcessor=libWPAY function=Purchase amount=4000
[2026-01-05 09:01:03].000 W/XINFOR  ( 1200): vQA_9.9.9 Process.cs:1866 [CDO] EMV complete returned: iEMVResult=1 iResultCode=32 responseCode=91 fChipDecisionOverride=False
[2026-01-05 09:01:04].000 W/XINFOR  ( 1200): vQA_9.9.9 Printing.cs:285 PrintDualTextCallback: L: DECLINED R: 91
[2026-01-05 09:01:05].000 W/XWARN   ( 1200): vQA_9.9.9 ShellClient.cs:259 [FBTRACE] ShellClient: transaction completed | merchant=1 usResult=0 currentItem=none (Primary) recordingAsSaf=False
[2026-01-05 09:01:05].500 W/XWARN   ( 1200): vQA_9.9.9 ShellClient.cs:328 [FBTRACE] ShellClient: transaction end | merchant=1 stateItemId=0
[2026-01-05 09:02:00].000 W/XWARN   ( 1200): vQA_9.9.9 ShellClient.cs:208 [FBTRACE] ShellClient: transaction start | merchant=1 eftProcessor=libWPAY function=Purchase amount=500
[2026-01-05 09:02:01].000 W/XWARN   ( 1200): vQA_9.9.9 PaxSmartDevice.cs:2033 PCE_CANCEL_PRESSED=CARD
[2026-01-05 09:02:02].000 W/XWARN   ( 1200): vQA_9.9.9 ShellClient.cs:328 [FBTRACE] ShellClient: transaction end | merchant=1 stateItemId=0
[2026-01-05 09:03:00].000 W/XWARN   ( 1200): vQA_9.9.9 ShellClient.cs:208 [FBTRACE] ShellClient: transaction start | merchant=1 eftProcessor=libWPAY function=Purchase amount=700
[2026-01-05 09:03:00].500 W/PAYMENTAPP_DIALOG( 1200): CloudBanking.ShellUI.RequestCardDialog
[2026-01-05 09:03:01].000 E/AndroidRuntime( 1200): FATAL EXCEPTION: main
[2026-01-05 09:03:01].000 E/AndroidRuntime( 1200): Process: com.xcr.singleapp.wpay, PID: 1200
[2026-01-05 09:03:01].000 E/AndroidRuntime( 1200): android.runtime.JavaProxyThrowable: [System.NullReferenceException]: Object reference not set to an instance of an object
[2026-01-05 09:03:01].000 E/AndroidRuntime( 1200): 	at Java.Interop.TypeManager.CreateProxy + 0x0(Unknown Source)
[2026-01-05 09:03:01].000 E/AndroidRuntime( 1200): 	at Android.App.Activity.n_OnCreate + 0x12(Unknown Source)
[2026-01-05 09:03:01].200 W/ActivityManager(  600): Killing 1200:com.xcr.singleapp.wpay/u0a101 (adj 0): crash
[2026-01-05 09:03:01].300 W/ActivityManager(  600): Process com.xcr.singleapp.wpay (pid 1200) has died: fore TOP
[2026-01-05 09:03:01].400 W/ActivityTaskManager(  600): Force removing ActivityRecord{abc u0 com.xcr.singleapp.wpay/cloudBanking.singlePaymentApp.MainActivity t12 f}: app died, no saved state
[2026-01-05 09:04:00].000 E/AndroidRuntime( 1300): FATAL EXCEPTION: Thread-2
[2026-01-05 09:04:00].000 E/AndroidRuntime( 1300): Process: com.pax.paxsdt, PID: 1300
[2026-01-05 09:04:00].000 E/AndroidRuntime( 1300): java.lang.NullPointerException: ioexception restart sdt
[2026-01-05 09:04:00].000 E/AndroidRuntime( 1300): 	at com.pax.paxsdt.ReadThread.run(ReadThread.java:12)
[2026-01-05 09:05:00].000 W/XWARN   ( 1400): vQA_1.2.27.48.1 X:\CloudBanking\CloudBanking.UI\CloudBanking.DroidCommon\Activities\MainShellActivity.cs:79 Power Failure: fAutoStart = False
[2026-01-05 09:05:00].100 W/ActivityManager(  600): Killing 1400:com.xcr.singleapp.certification.sek/u0a140 (adj 800): remove task`

/** Two boots that reuse pid 1200 around an ART reboot marker, a short out-of-order line, and a dump seam whose
 * clock reads 00:00:00. */
export const PID_REUSE_LOG = String.raw`[2026-01-05 10:00:00].000 W/ActivityManager(  600): Start proc 1200:com.xcr.singleapp.wpay/u0a101 for broadcast {com.xcr.singleapp.wpay/crc6402cde6085f70f513.BootReceiver}
[2026-01-05 10:00:01].000 W/XINFOR  ( 1200): vQA_9.9.9 MainActivity.cs:583 App background image applied: /data/x.jpg
[2026-01-05 10:00:02].000 W/XINFOR  ( 1200): vQA_9.9.9 DroidLogUploadSchedule.cs:141 Network event: Available
[2026-01-05 09:58:00].000 W/HwBinder:380_1(  380): type=1400 audit(0.0:2773): avc: denied { read } for name="x"
[2026-01-05 10:00:03].000 W/XINFOR  ( 1200): vQA_9.9.9 DroidLogUploadSchedule.cs:141 Network event: CapabilitiesChanged
[2026-01-05 10:00:04].000 W/XINFOR  ( 1200): vQA_9.9.9 DroidLogUploadSchedule.cs:206 starting UploadLogs......
[2026-01-05 10:00:05].000 W/XINFOR  ( 1200): vQA_9.9.9 DroidLogUploadSchedule.cs:280 [52001844_2026-01-05_100000_000.zip] has been uploaded
[2026-01-05 10:00:06].000 W/XINFOR  ( 1200): vQA_9.9.9 DroidLogUploadSchedule.cs:470 DroidLogUploadSchedule: Connected successfully
[2026-01-05 10:30:00].000 F/art_apex(  356): Device is not fsverity-enabled.
[2026-01-05 10:30:01].000 W/DLOG    (  369): sys.boot_completed=0, sys.system_ready=1
[2026-01-05 10:30:02].000 W/ActivityManager(  601): Start proc 1200:com.xcr.singleapp.wpay/u0a101 for activity {com.xcr.singleapp.wpay/cloudBanking.singlePaymentApp.MainActivity}
[2026-01-05 10:30:03].000 W/XINFOR  ( 1200): vQA_9.9.9 MainActivity.cs:583 App background image applied: /data/y.jpg
[2026-01-05 10:30:04].000 W/XINFOR  ( 1200): vQA_9.9.9 DroidLogUploadSchedule.cs:141 Network event: Available
[2026-01-05 10:30:05].000 W/ActivityManager(  601): Killing 1200:com.xcr.singleapp.wpay/u0a101 (adj 800): stop com.xcr.singleapp.wpay
[2026-01-05 00:00:00].050 W/DLOG    (  370): sys.boot_completed=0, sys.system_ready=1
[2026-01-05 00:00:01].000 W/ActivityManager(  602): Start proc 1300:com.xcr.singleapp.wpay/u0a101 for service {com.xcr.singleapp.wpay/cloudBanking.PaxSdk.DownloadParamService}
[2026-01-05 00:00:02].000 W/XINFOR  ( 1300): vQA_9.9.9 MainActivity.cs:583 App background image applied: /data/z.jpg
[2026-01-05 00:00:03].000 W/XINFOR  ( 1300): vQA_9.9.9 DroidLogUploadSchedule.cs:141 Network event: Available
[2026-01-05 00:00:04].000 W/XINFOR  ( 1300): vQA_9.9.9 DroidLogUploadSchedule.cs:141 Network event: CapabilitiesChanged
[2026-01-05 00:00:05].000 W/XINFOR  ( 1300): vQA_9.9.9 DroidLogUploadSchedule.cs:206 starting UploadLogs......`

export const FIXTURES: Record<string, string> = {
  'basic.log': BASIC_LOG,
  'pid-reuse.log': PID_REUSE_LOG,
}
