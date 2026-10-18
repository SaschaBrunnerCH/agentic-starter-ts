#version 300 es
precision highp float;
in vec4 ink;
out vec4 pixel;

void main() {
  pixel = ink;
}
