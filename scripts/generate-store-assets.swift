import AppKit
import Foundation

let fileManager = FileManager.default
let root = URL(fileURLWithPath: fileManager.currentDirectoryPath)
let outputDirectory = root.appendingPathComponent("docs/store-assets/generated", isDirectory: true)
try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

guard let icon = NSImage(contentsOf: root.appendingPathComponent("public/icon/128.png")) else {
    fatalError("无法读取 public/icon/128.png")
}

func color(_ red: Int, _ green: Int, _ blue: Int) -> NSColor {
    NSColor(
        calibratedRed: CGFloat(red) / 255,
        green: CGFloat(green) / 255,
        blue: CGFloat(blue) / 255,
        alpha: 1
    )
}

func drawText(
    _ text: String,
    in rect: NSRect,
    size: CGFloat,
    weight: NSFont.Weight,
    foreground: NSColor
) {
    let style = NSMutableParagraphStyle()
    style.lineBreakMode = .byWordWrapping
    style.alignment = .left
    style.lineSpacing = size * 0.12
    (text as NSString).draw(
        in: rect,
        withAttributes: [
            .font: NSFont.systemFont(ofSize: size, weight: weight),
            .foregroundColor: foreground,
            .paragraphStyle: style,
        ]
    )
}

func save(_ image: NSImage, name: String, width: Int, height: Int) throws {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: width,
        pixelsHigh: height,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        fatalError("无法生成 \(name)")
    }
    bitmap.size = NSSize(width: width, height: height)

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    image.draw(
        in: NSRect(x: 0, y: 0, width: width, height: height),
        from: NSRect(origin: .zero, size: image.size),
        operation: .copy,
        fraction: 1
    )
    NSGraphicsContext.restoreGraphicsState()

    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("无法编码 \(name)")
    }
    try png.write(to: outputDirectory.appendingPathComponent(name))
}

func makePromo(width: CGFloat, height: CGFloat, name: String) throws {
    let canvas = NSImage(size: NSSize(width: width, height: height))
    canvas.lockFocus()

    color(248, 250, 252).setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()

    color(37, 99, 235).setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: width * 0.018, height: height)).fill()
    color(251, 114, 153).setFill()
    NSBezierPath(rect: NSRect(x: width * 0.018, y: 0, width: width * 0.008, height: height)).fill()

    let compact = width < 700
    let iconSize = compact ? min(112, height * 0.42) : min(168, height * 0.42)
    let iconX = compact ? 34.0 : 86.0
    let iconY = (height - iconSize) / 2
    icon.draw(
        in: NSRect(x: iconX, y: iconY, width: iconSize, height: iconSize),
        from: .zero,
        operation: .sourceOver,
        fraction: 1
    )

    let textX = iconX + iconSize + (compact ? 24 : 56)
    let textWidth = width - textX - (compact ? 22 : 72)
    let titleSize: CGFloat = compact ? 23 : 48
    let subtitleSize: CGFloat = compact ? 13 : 25
    drawText(
        "哔哩哔哩历史记录\n保存与分析",
        in: NSRect(x: textX, y: height * 0.43, width: textWidth, height: height * 0.42),
        size: titleSize,
        weight: .semibold,
        foreground: color(17, 24, 39)
    )
    drawText(
        "长期保存 · 快速查找 · 观看趋势分析",
        in: NSRect(x: textX, y: height * 0.25, width: textWidth, height: height * 0.14),
        size: subtitleSize,
        weight: .regular,
        foreground: color(75, 85, 99)
    )

    let badgeWidth: CGFloat = compact ? 76 : 132
    let badgeHeight: CGFloat = compact ? 25 : 42
    let badgeRect = NSRect(x: textX, y: height * 0.1, width: badgeWidth, height: badgeHeight)
    color(229, 231, 235).setFill()
    NSBezierPath(roundedRect: badgeRect, xRadius: badgeHeight / 2, yRadius: badgeHeight / 2).fill()
    drawText(
        "非官方工具",
        in: NSRect(
            x: badgeRect.minX + (compact ? 10 : 19),
            y: badgeRect.minY + (compact ? 5 : 8),
            width: badgeRect.width - (compact ? 20 : 38),
            height: badgeRect.height - (compact ? 8 : 14)
        ),
        size: compact ? 11 : 18,
        weight: .medium,
        foreground: color(55, 65, 81)
    )

    canvas.unlockFocus()
    try save(canvas, name: name, width: Int(width), height: Int(height))
}

func makeStoreLogo() throws {
    let canvas = NSImage(size: NSSize(width: 300, height: 300))
    canvas.lockFocus()
    NSColor.clear.setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: 300, height: 300)).fill()
    icon.draw(
        in: NSRect(x: 0, y: 0, width: 300, height: 300),
        from: .zero,
        operation: .sourceOver,
        fraction: 1
    )
    canvas.unlockFocus()
    try save(canvas, name: "store-logo-300.png", width: 300, height: 300)
}

try makePromo(width: 440, height: 280, name: "promo-small-440x280.png")
try makePromo(width: 1400, height: 560, name: "promo-large-1400x560.png")
try makeStoreLogo()

print("商店宣传图已生成到 docs/store-assets/generated")
