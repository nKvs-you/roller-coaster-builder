import { useMemo } from "react";
import { useRollerCoaster } from "@/lib/stores/useRollerCoaster";

export function Sky() {
  const { isNightMode } = useRollerCoaster();
  
  const parkLights = useMemo(() => {
    const lights: { x: number; z: number; height: number; color: string }[] = [];
    
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const radius = 60 + (i * 7) % 100;
      lights.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        height: 8 + (i % 4),
        color: ["#FFD700", "#FF6B6B", "#4ECDC4", "#FF69B4", "#00CED1", "#FFFFFF"][i % 6]
      });
    }
    return lights;
  }, []);
  
  const stars = useMemo(() => {
    const s: { x: number; y: number; z: number; size: number }[] = [];
    for (let i = 0; i < 100; i++) {
      s.push({
        x: (i * 17 % 500) - 250,
        y: 60 + (i * 13 % 50),
        z: (i * 23 % 500) - 250,
        size: 0.15 + (i % 3) * 0.05
      });
    }
    return s;
  }, []);
  
  const ferrisWheel = useMemo(() => {
    const spokes: { angle: number; color: string }[] = [];
    for (let i = 0; i < 12; i++) {
      spokes.push({
        angle: (i / 12) * Math.PI * 2,
        color: ["#FF0000", "#FFFF00", "#00FF00", "#0000FF", "#FF00FF", "#00FFFF"][i % 6]
      });
    }
    return spokes;
  }, []);
  
  if (isNightMode) {
    return (
      <>
        <color attach="background" args={["#101025"]} />
        <fog attach="fog" args={["#101025", 150, 500]} />
        
        <ambientLight intensity={0.4} color="#6688cc" />
        <directionalLight position={[50, 50, 25]} intensity={0.5} color="#8899bb" />
        
        <pointLight position={[0, 30, 0]} intensity={2} color="#FFFFFF" distance={150} />
        <pointLight position={[100, 40, -80]} intensity={1.5} color="#FF88FF" distance={100} />
        <pointLight position={[-80, 35, 60]} intensity={1.5} color="#FFAA44" distance={100} />
        
        <mesh position={[-60, 45, -80]}>
          <sphereGeometry args={[6, 32, 32]} />
          <meshBasicMaterial color="#FFFFEE" />
        </mesh>
        
        {stars.map((star, i) => (
          <mesh key={i} position={[star.x, star.y, star.z]}>
            <sphereGeometry args={[star.size, 6, 6]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
        ))}
        
        {parkLights.map((light, i) => (
          <group key={`post-${i}`} position={[light.x, 0, light.z]}>
            <mesh position={[0, light.height / 2, 0]}>
              <cylinderGeometry args={[0.15, 0.2, light.height, 6]} />
              <meshStandardMaterial color="#444444" />
            </mesh>
            <mesh position={[0, light.height + 0.5, 0]}>
              <sphereGeometry args={[0.8, 12, 12]} />
              <meshBasicMaterial color={light.color} />
            </mesh>
          </group>
        ))}
        
        <group position={[120, 0, -100]}>
          <mesh position={[0, 22, 0]}>
            <cylinderGeometry args={[1, 1.5, 44, 8]} />
            <meshStandardMaterial color="#555555" />
          </mesh>
          <mesh position={[0, 28, 0]}>
            <torusGeometry args={[18, 0.6, 8, 32]} />
            <meshBasicMaterial color="#FF00FF" />
          </mesh>
          {ferrisWheel.map((spoke, i) => (
            <mesh key={i} position={[Math.cos(spoke.angle) * 18, 28 + Math.sin(spoke.angle) * 18, 0]}>
              <boxGeometry args={[3, 3, 3]} />
              <meshBasicMaterial color={spoke.color} />
            </mesh>
          ))}
        </group>
        
        <group position={[-100, 0, 80]}>
          <mesh position={[0, 35, 0]}>
            <cylinderGeometry args={[4, 6, 70, 10]} />
            <meshStandardMaterial color="#444466" />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0, 10 + i * 12, 0]}>
              <torusGeometry args={[8, 0.4, 6, 24]} />
              <meshBasicMaterial color={["#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#FF00FF"][i]} />
            </mesh>
          ))}
        </group>
        
        <group position={[80, 0, 100]}>
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[12, 14, 8, 16]} />
            <meshStandardMaterial color="#774499" />
          </mesh>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const angle = (i / 8) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(angle) * 10, 5, Math.sin(angle) * 10]}>
                <boxGeometry args={[2, 3, 1.5]} />
                <meshBasicMaterial color={["#FF0000", "#00FF00", "#0000FF", "#FFFF00"][i % 4]} />
              </mesh>
            );
          })}
        </group>
        
        <group position={[-80, 0, -120]}>
          <mesh position={[0, 25, 0]}>
            <cylinderGeometry args={[2, 3, 50, 8]} />
            <meshStandardMaterial color="#553333" />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <group key={i}>
              <mesh position={[8, 12 + i * 10, 0]}>
                <boxGeometry args={[14, 0.6, 2]} />
                <meshBasicMaterial color={i % 2 === 0 ? "#FF6600" : "#FFFF00"} />
              </mesh>
              <mesh position={[-8, 12 + i * 10, 0]}>
                <boxGeometry args={[14, 0.6, 2]} />
                <meshBasicMaterial color={i % 2 === 0 ? "#FFFF00" : "#FF6600"} />
              </mesh>
            </group>
          ))}
        </group>
        
        <group position={[150, 0, 50]}>
          <mesh position={[0, 20, 0]}>
            <cylinderGeometry args={[1.5, 2, 40, 8]} />
            <meshStandardMaterial color="#336633" />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const angle = (i / 6) * Math.PI * 2;
            return (
              <group key={i}>
                <mesh position={[Math.cos(angle) * 6, 35, Math.sin(angle) * 6]} rotation={[0, angle, 0]}>
                  <boxGeometry args={[12, 0.5, 1]} />
                  <meshBasicMaterial color="#00FF00" />
                </mesh>
                <mesh position={[Math.cos(angle) * 12, 33, Math.sin(angle) * 12]}>
                  <boxGeometry args={[2, 4, 2]} />
                  <meshBasicMaterial color={["#FF0000", "#FFFF00", "#00FFFF"][i % 3]} />
                </mesh>
              </group>
            );
          })}
        </group>
        
        <group position={[-150, 0, -50]}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
            const x = (i % 4) * 10 - 15;
            const z = Math.floor(i / 4) * 10 - 10;
            return (
              <mesh key={i} position={[x, 3, z]}>
                <boxGeometry args={[4, 6, 4]} />
                <meshBasicMaterial color={["#FF0000", "#FFFF00", "#00FF00", "#0000FF", "#FF00FF"][i % 5]} />
              </mesh>
            );
          })}
        </group>
      </>
    );
  }
  
  return (
    <>
      {/* Beautiful gradient sky */}
      <color attach="background" args={["#7EC8E3"]} />
      <fog attach="fog" args={["#B8E1FF", 150, 500]} />
      
      {/* Sun with glow effect */}
      <group position={[80, 60, -80]}>
        {/* Sun glow */}
        <mesh>
          <sphereGeometry args={[20, 32, 32]} />
          <meshBasicMaterial color="#FFF8E1" transparent opacity={0.3} />
        </mesh>
        <mesh>
          <sphereGeometry args={[12, 32, 32]} />
          <meshBasicMaterial color="#FFEB3B" transparent opacity={0.5} />
        </mesh>
        {/* Sun core */}
        <mesh>
          <sphereGeometry args={[6, 32, 32]} />
          <meshBasicMaterial color="#FFF59D" />
        </mesh>
      </group>
      
      {/* Clouds */}
      {[
        { pos: [-100, 80, -150], scale: 1.2 },
        { pos: [50, 90, -200], scale: 1.5 },
        { pos: [150, 70, -100], scale: 1.0 },
        { pos: [-50, 85, -180], scale: 0.8 },
        { pos: [120, 95, -220], scale: 1.3 },
      ].map((cloud, i) => (
        <group key={`cloud-${i}`} position={[cloud.pos[0], cloud.pos[1], cloud.pos[2]]} scale={cloud.scale}>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[8, 16, 16]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
          </mesh>
          <mesh position={[10, -2, 0]}>
            <sphereGeometry args={[6, 16, 16]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
          </mesh>
          <mesh position={[-8, -1, 2]}>
            <sphereGeometry args={[7, 16, 16]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
          </mesh>
          <mesh position={[5, 3, -2]}>
            <sphereGeometry args={[5, 16, 16]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
          </mesh>
        </group>
      ))}
      
      {/* Enhanced lighting */}
      <ambientLight intensity={0.5} color="#E3F2FD" />
      <directionalLight
        position={[80, 60, -80]}
        intensity={1.2}
        color="#FFF8E1"
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-far={300}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
        shadow-bias={-0.0001}
      />
      <hemisphereLight args={["#87CEEB", "#4CAF50", 0.4]} />
      
      {/* Subtle fill light */}
      <directionalLight
        position={[-50, 30, 50]}
        intensity={0.3}
        color="#B3E5FC"
      />
    </>
  );
}
