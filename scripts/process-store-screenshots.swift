import AppKit
import Foundation

let arguments = CommandLine.arguments
guard arguments.count == 4 else {
    fatalError("用法：swift scripts/process-store-screenshots.swift <历史记录截图> <分析截图> <设置截图>")
}

let fileManager = FileManager.default
let root = URL(fileURLWithPath: fileManager.currentDirectoryPath)
let outputDirectory = root.appendingPathComponent("docs/store-assets/generated", isDirectory: true)
try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

struct ScreenshotSpec {
    let input: String
    let output: String
    let title: String
    let subtitle: String
}

let specs = [
    ScreenshotSpec(
        input: arguments[1],
        output: "01-history-1280x800.png",
        title: "长期保存每一条观看记录",
        subtitle: "按日期、类型、标题、UP 主和视频编号快速查找"
    ),
    ScreenshotSpec(
        input: arguments[2],
        output: "02-analytics-1280x800.png",
        title: "看懂自己的观看习惯",
        subtitle: "查看观看进度、视频长度、跳出与看完趋势"
    ),
    ScreenshotSpec(
        input: arguments[3],
        output: "03-settings-1280x800.png",
        title: "数据默认只保存在本机",
        subtitle: "支持时区、备份恢复和用户自建云端同步"
    ),
]

func color(_ red: Int, _ green: Int, _ blue: Int) -> NSColor {
    NSColor(
        calibratedRed: CGFloat(red) / 255,
        green: CGFloat(green) / 255,
        blue: CGFloat(blue) / 255,
        alpha: 1
    )
}

func drawText(_ text: String, at point: NSPoint, size: CGFloat, weight: NSFont.Weight, color: NSColor) {
    (text as NSString).draw(
        at: point,
        withAttributes: [
            .font: NSFont.systemFont(ofSize: size, weight: weight),
            .foregroundColor: color,
        ]
    )
}

func save(_ image: NSImage, to url: URL) throws {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: 1280,
        pixelsHigh: 800,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        fatalError("无法创建位图：\(url.lastPathComponent)")
    }
    bitmap.size = NSSize(width: 1280, height: 800)

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSColor.white.setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1280, height: 800)).fill()
    image.draw(
        in: NSRect(x: 0, y: 0, width: 1280, height: 800),
        from: .zero,
        operation: .sourceOver,
        fraction: 1
    )
    NSGraphicsContext.restoreGraphicsState()

    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("无法生成 PNG：\(url.lastPathComponent)")
    }
    try data.write(to: url)
}

for spec in specs {
    let inputURL = URL(fileURLWithPath: spec.input)
    guard let source = NSImage(contentsOf: inputURL),
          let sourceCG = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        fatalError("无法读取：\(spec.input)")
    }

    // All three inputs use the same Safari window geometry. Keep only the
    // extension viewport, excluding black margins, browser chrome and tabs.
    let crop = CGRect(x: 112, y: 247, width: 2940, height: 1468)
    guard let croppedCG = sourceCG.cropping(to: crop) else {
        fatalError("无法裁剪：\(spec.input)")
    }
    let cropped = NSImage(cgImage: croppedCG, size: NSSize(width: crop.width, height: crop.height))

    let canvas = NSImage(size: NSSize(width: 1280, height: 800))
    canvas.lockFocus()
    NSGraphicsContext.saveGraphicsState()

    color(248, 250, 252).setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1280, height: 800)).fill()

    let screenshotHeight: CGFloat = 639
    cropped.draw(
        in: NSRect(x: 0, y: 0, width: 1280, height: screenshotHeight),
        from: .zero,
        operation: .copy,
        fraction: 1
    )

    color(37, 99, 235).setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 639, width: 10, height: 161)).fill()
    color(251, 114, 153).setFill()
    NSBezierPath(rect: NSRect(x: 10, y: 639, width: 5, height: 161)).fill()

    drawText(spec.title, at: NSPoint(x: 48, y: 724), size: 30, weight: .semibold, color: color(17, 24, 39))
    drawText(spec.subtitle, at: NSPoint(x: 49, y: 681), size: 17, weight: .regular, color: color(75, 85, 99))
    drawText("哔哩哔哩历史记录保存与分析 · 非官方工具", at: NSPoint(x: 49, y: 650), size: 13, weight: .medium, color: color(107, 114, 128))

    NSGraphicsContext.restoreGraphicsState()
    canvas.unlockFocus()
    try save(canvas, to: outputDirectory.appendingPathComponent(spec.output))
}

print("三张 1280×800 商店截图已生成到 docs/store-assets/generated")
