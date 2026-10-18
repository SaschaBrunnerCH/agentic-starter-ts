#version 300 es
in vec2 position;
in vec4 color;
out vec4 ink;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
  ink = color;
}
