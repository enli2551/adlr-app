import UIKit
import Capacitor

/// Capacitor bridge with the app's own local plugins registered (RestChrono, BarcodeScanner).
class ADLRBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RestChronoPlugin())
        bridge?.registerPluginInstance(BarcodeScannerPlugin())
    }
}
