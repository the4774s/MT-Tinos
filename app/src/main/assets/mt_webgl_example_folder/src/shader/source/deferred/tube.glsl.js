export default "@export clay.deferred.tube_light\n@import clay.deferred.chunk.light_head\n@import clay.util.calculate_attenuation\n@import clay.deferred.chunk.light_equation\nuniform vec3 lightPosition;\nuniform vec3 lightColor;\nuniform float lightRange;\nuniform vec3 lightExtend;\nuniform vec3 eyePosition;\nvarying vec3 v_Position;\nvoid main()\n{\n @import clay.deferred.chunk.gbuffer_read\n vec3 L = lightPosition - position;\n vec3 V = normalize(eyePosition - position);\n vec3 R = reflect(V, N);\n vec3 L0 = lightPosition - lightExtend - position;\n vec3 L1 = lightPosition + lightExtend - position;\n vec3 LD = L1 - L0;\n float len0 = length(L0);\n float len1 = length(L1);\n float irra = 2.0 * clamp(dot(N, L0) / (2.0 * len0) + dot(N, L1) / (2.0 * len1), 0.0, 1.0);\n float LDDotR = dot(R, LD);\n float t = (LDDotR * dot(R, L0) - dot(L0, LD)) / (dot(LD, LD) - LDDotR * LDDotR);\n t = clamp(t, 0.0, 1.0);\n L = L0 + t * LD;\n float dist = length(L);\n L /= dist;\n vec3 H = normalize(L + V);\n float ndh = clamp(dot(N, H), 0.0, 1.0);\n float ndv = clamp(dot(N, V), 0.0, 1.0);\n glossiness = clamp(glossiness - 0.0 / 2.0 / dist, 0.0, 1.0);\n gl_FragColor.rgb = lightColor * irra * lightAttenuation(dist, lightRange)\n * (diffuseColor + D_Phong(glossiness, ndh) * F_Schlick(ndv, specularColor));\n gl_FragColor.a = 1.0;\n}\n@end";
