struct Vertex {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
}

@vertex
fn vertex(@location(0) position: vec2f, @location(1) color: vec4f) -> Vertex {
  return Vertex(vec4f(position, 0.0, 1.0), color);
}

@fragment
fn fragment(input: Vertex) -> @location(0) vec4f {
  return input.color;
}
