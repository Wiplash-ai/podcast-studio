import Foundation
import Testing
@testable import Porchcast

struct DemoRepositoryTests {
    @Test("Debug app launch defaults offline while Release remains Cloud-first")
    func appLaunchDefaultsMatchBuildIntent() {
        let compiledDebugDefault = AppEnvironment.selectedForAppLaunch(runtimeValue: nil)
        let debug = AppEnvironment.selectedForAppLaunch(
            runtimeValue: nil,
            isDebugBuild: true
        )
        let release = AppEnvironment.selectedForAppLaunch(
            runtimeValue: nil,
            isDebugBuild: false
        )

        #expect(compiledDebugDefault.adapterMode == .deterministicDemo)
        #expect(debug.adapterMode == .deterministicDemo)
        #expect(release.adapterMode == .cloud)
    }

    @Test("An explicit runtime overrides the local Debug default")
    func explicitRuntimeOverridesDebugDefault() {
        let cloud = AppEnvironment.selectedForAppLaunch(
            runtimeValue: "cloud",
            isDebugBuild: true
        )
        let demo = AppEnvironment.selectedForAppLaunch(
            runtimeValue: "demo",
            isDebugBuild: false
        )
        let unknown = AppEnvironment.selectedForAppLaunch(
            runtimeValue: "demoo",
            isDebugBuild: true
        )

        #expect(cloud.adapterMode == .cloud)
        #expect(demo.adapterMode == .deterministicDemo)
        #expect(unknown.adapterMode == .cloud)
    }

    @Test("Cloud remains the default configuration while demo adapters are explicit")
    func cloudDefaultWithExplicitDemoAdapters() {
        let cloud = AppEnvironment.selected(runtimeValue: nil)
        let demo = AppEnvironment.selected(runtimeValue: "demo")

        #expect(cloud.configuration.preferredBackend == .cloud)
        #expect(cloud.adapterMode == .cloud)
        #expect(demo.configuration.preferredBackend == .cloud)
        #expect(demo.adapterMode == .deterministicDemo)
        #expect(demo.configuration.cloud.universalLinkHost == "labs.wiplash.ai")
    }

    @Test("Unknown runtime values fail closed to Cloud adapters")
    func unknownRuntimeSelectsCloud() async {
        let environment = AppEnvironment.selected(runtimeValue: "demoo")

        #expect(environment.adapterMode == .cloud)
        do {
            _ = try await environment.authentication.currentAccount()
            Issue.record("Expected the placeholder Cloud adapter to be unavailable")
        } catch let error as PorchcastError {
            #expect(error == .unavailable(UnavailableCloudAdapter.message))
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }

    @Test("Configured preference applies only when no runtime override is present")
    func configuredPreferenceRequiresAbsentRuntimeOverride() {
        var configuration = AppConfiguration.cloudDefault
        configuration.preferredBackend = .demo

        let configured = AppEnvironment.selected(
            runtimeValue: nil,
            configuration: configuration
        )
        let explicitUnknown = AppEnvironment.selected(
            runtimeValue: "demoo",
            configuration: configuration
        )

        #expect(configured.adapterMode == .deterministicDemo)
        #expect(explicitUnknown.adapterMode == .cloud)
    }

    @Test("Demo Porch creation is validated and deterministic")
    func createsDeterministicPorches() async throws {
        let repository = DemoPorchRepository()
        let account = DemoFixtures.anonymousAccount
        let request = CreatePorchRequest(
            title: "  Sound check  ",
            topic: "  Testing a native flow  ",
            guestCapacity: 12,
            admissionMode: .hostApproval,
            cloudRecordingEnabled: true
        )

        let first = try await repository.createPorch(request, host: account)
        let second = try await repository.createPorch(request, host: account)

        #expect(first.id == PorchID("demo-created-1"))
        #expect(first.inviteCode == "DEMO-01")
        #expect(first.title == "Sound check")
        #expect(first.capacity == 13)
        #expect(first.cloudRecordingEnabled)
        #expect(second.id == PorchID("demo-created-2"))
    }

    @Test("Foreign HTTPS hosts cannot masquerade as Porch invites")
    func rejectsForeignInviteHost() async {
        let repository = DemoPorchRepository()
        let link = URL(string: "https://example.invalid/porch/FIELD-07")!

        do {
            _ = try await repository.resolvePorch(.universalLink(link))
            Issue.record("Expected the foreign invite host to be rejected")
        } catch let error as PorchcastError {
            #expect(
                error == .invalidInput(
                    "Use a labs.wiplash.ai invite or Porchcast join link."
                )
            )
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }

    @Test("Invite codes and Universal Links resolve through one repository seam")
    func resolvesJoinReferences() async throws {
        let repository = DemoPorchRepository()

        let byCode = try await repository.resolvePorch(.inviteCode(" porch-13 "))
        let link = URL(string: "https://labs.wiplash.ai/porch/FIELD-07")!
        let byLink = try await repository.resolvePorch(.universalLink(link))

        #expect(byCode.id == PorchID("porch-roundtable"))
        #expect(byLink.id == PorchID("porch-field-notes"))
    }

    @Test("Invalid guest capacity is rejected")
    func rejectsInvalidCapacity() async {
        let repository = DemoPorchRepository()
        let invalid = CreatePorchRequest(
            title: "Too large",
            topic: "Capacity boundary",
            guestCapacity: 13,
            admissionMode: .open,
            cloudRecordingEnabled: false
        )

        do {
            _ = try await repository.createPorch(invalid, host: DemoFixtures.anonymousAccount)
            Issue.record("Expected an invalid input error")
        } catch let error as PorchcastError {
            #expect(error == .invalidInput("Choose room for 1 to 12 guests."))
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }
}
