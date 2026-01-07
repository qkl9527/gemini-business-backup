# Chrome Extension 图标说明

## 当前图标格式
扩展当前使用SVG格式的图标，浏览器会自动处理。

## 图标文件
- `icon16.svg` - 16x16 工具栏图标
- `icon48.svg` - 48x48 扩展管理页面图标
- `icon128.svg` - 128x128 Chrome Web Store图标

## 转换为PNG（可选）
如果需要PNG格式的图片，可以使用以下在线工具：

### 在线转换工具
1. **SVG to PNG Converter** (https://svgtopng.com/)
2. **CloudConvert** (https://cloudconvert.com/svg-to-png)
3. **Online-Convert** (https://image.online-convert.com/convert/svg-to-png)

### 使用步骤
1. 打开上述任一在线工具网站
2. 上传对应的SVG文件
3. 设置输出尺寸（16x16, 48x48, 128x128）
4. 下载转换后的PNG文件
5. 将PNG文件重命名为 `icon16.png`, `icon48.png`, `icon128.png`
6. 更新 `manifest.json` 中的图标路径

### 本地转换（如果有ImageMagick）
```bash
convert icon16.svg icon16.png
convert icon48.svg icon48.png
convert icon128.svg icon128.png
```

## 注意事项
- Chrome扩展支持SVG格式的图标（Chrome 80+）
- Firefox也支持SVG格式
- 如果需要上传到Chrome Web Store，建议使用PNG格式
