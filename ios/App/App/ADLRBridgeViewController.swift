import UIKit
import Capacitor

/// Capacitor bridge with the app's own local plugins registered (RestChrono).
class ADLRBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RestChronoPlugin())
    }
}
