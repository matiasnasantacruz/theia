# Theia - OZW Visual Editor Extension

Visual builder extension for creating low-code/no-code applications with `.ozw` files.

## Features

- **Visual Canvas Mode**: Drag-and-drop visual builder for creating UI layouts
- **Text Editor Mode**: Direct code editing with Monaco editor
- **Split View Mode**: Edit visually and see code simultaneously
- **Component Toolbox**: Pre-built UI components (buttons, inputs, cards, etc.)

## File Format

`.ozw` files store application layouts in JSON format:

```json
{
  "version": "1.0",
  "components": [
    {
      "type": "button",
      "id": "btn1",
      "properties": {
        "label": "Click Me",
        "x": 100,
        "y": 100
      }
    }
  ]
}
```

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
