// iOS barcode scanner for the food diary (src/lib/barcode.ts). Same JS name and API as the
// ML Kit plugin used on Android ("BarcodeScanner": requestPermissions(), scan()), but built on
// AVFoundation — the ML Kit plugin has no Swift Package, and this app uses SPM.
import Foundation
import AVFoundation
import UIKit
import Capacitor

@objc(BarcodeScannerPlugin)
public class BarcodeScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BarcodeScannerPlugin"
    public let jsName = "BarcodeScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
    ]

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            call.resolve(["camera": "granted"])
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { ok in
                call.resolve(["camera": ok ? "granted" : "denied"])
            }
        default:
            call.resolve(["camera": "denied"])
        }
    }

    @objc func scan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let vc = ScannerViewController()
            vc.modalPresentationStyle = .fullScreen
            vc.onFinish = { code in
                if let code = code {
                    call.resolve(["barcodes": [["rawValue": code, "displayValue": code]]])
                } else {
                    call.resolve(["barcodes": []])
                }
            }
            self.bridge?.viewController?.present(vc, animated: true)
        }
    }
}

final class ScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onFinish: ((String?) -> Void)?
    private let session = AVCaptureSession()
    private var finished = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        if let device = AVCaptureDevice.default(for: .video),
           let input = try? AVCaptureDeviceInput(device: device),
           session.canAddInput(input) {
            session.addInput(input)
            let output = AVCaptureMetadataOutput()
            if session.canAddOutput(output) {
                session.addOutput(output)
                output.setMetadataObjectsDelegate(self, queue: .main)
                let wanted: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce, .code128]
                output.metadataObjectTypes = wanted.filter { output.availableMetadataObjectTypes.contains($0) }
            }
            let preview = AVCaptureVideoPreviewLayer(session: session)
            preview.videoGravity = .resizeAspectFill
            preview.frame = view.bounds
            view.layer.addSublayer(preview)
        }

        // aiming frame + hint + cancel
        let frame = UIView()
        frame.layer.borderColor = UIColor(red: 0.79, green: 0.66, blue: 0.30, alpha: 1).cgColor
        frame.layer.borderWidth = 3
        frame.layer.cornerRadius = 14
        frame.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(frame)

        let hint = UILabel()
        let lang = Locale.preferredLanguages.first?.prefix(2) ?? "de"
        hint.text = lang == "hu" ? "Tartsd a vonalkódot a keretbe" : lang == "en" ? "Hold the barcode inside the frame" : "Barcode in den Rahmen halten"
        hint.textColor = .white
        hint.font = .systemFont(ofSize: 15, weight: .medium)
        hint.textAlignment = .center
        hint.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hint)

        let cancel = UIButton(type: .system)
        cancel.setTitle("✕", for: .normal)
        cancel.titleLabel?.font = .systemFont(ofSize: 26, weight: .semibold)
        cancel.tintColor = .white
        cancel.backgroundColor = UIColor(white: 0, alpha: 0.45)
        cancel.layer.cornerRadius = 24
        cancel.translatesAutoresizingMaskIntoConstraints = false
        cancel.addTarget(self, action: #selector(close), for: .touchUpInside)
        view.addSubview(cancel)

        NSLayoutConstraint.activate([
            frame.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            frame.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            frame.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.8),
            frame.heightAnchor.constraint(equalTo: frame.widthAnchor, multiplier: 0.5),
            hint.topAnchor.constraint(equalTo: frame.bottomAnchor, constant: 18),
            hint.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            hint.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            cancel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            cancel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            cancel.widthAnchor.constraint(equalToConstant: 48),
            cancel.heightAnchor.constraint(equalToConstant: 48),
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        view.layer.sublayers?.compactMap { $0 as? AVCaptureVideoPreviewLayer }.forEach { $0.frame = view.bounds }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        DispatchQueue.global(qos: .userInitiated).async { [session] in session.startRunning() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning { session.stopRunning() }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !finished,
              let obj = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              var code = obj.stringValue else { return }
        // iOS reports UPC-A as EAN-13 with a leading 0 — keep the EAN-13 form (Open Food Facts accepts it)
        code = code.trimmingCharacters(in: .whitespaces)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        finish(code)
    }

    @objc private func close() { finish(nil) }

    private func finish(_ code: String?) {
        guard !finished else { return }
        finished = true
        session.stopRunning()
        dismiss(animated: true) { [onFinish] in onFinish?(code) }
    }
}
