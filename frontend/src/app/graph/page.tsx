'use client';

import {
  Box,
  Flex,
  Text,
  Badge,
  Button,
  Select,
  Switch,
  FormControl,
  FormLabel,
  HStack,
  VStack,
  Spinner,
  Icon,
  useColorModeValue,
  Divider,
  CloseButton,
  Link,
} from '@chakra-ui/react';
import { useQuery, gql } from '@apollo/client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { MdAccountTree, MdRefresh, MdOpenInNew } from 'react-icons/md';
import Card from 'components/card/Card';
import { usePageHeader } from 'contexts/PageHeaderContext';

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

const GET_POLICY_GRAPH = gql`
  query GetPolicyGraph(
    $policyType: String
    $endpointStatus: String
    $riskSeverity: String
    $includeIncidents: Boolean
  ) {
    policyGraph(
      policyType: $policyType
      endpointStatus: $endpointStatus
      riskSeverity: $riskSeverity
      includeIncidents: $includeIncidents
    ) {
      nodeCount
      edgeCount
      nodes {
        id
        nodeType
        label
        subLabel
        status
        color
        meta
      }
      edges {
        source
        target
        relationship
        label
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  nodeType: string;
  label: string;
  subLabel: string;
  status: string;
  color: string;
  meta: string;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  label: string;
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// ---------------------------------------------------------------------------
// Force simulation (pure JS, no library needed)
// ---------------------------------------------------------------------------

const NODE_RADIUS = 22;

function runSimulation(
  nodes: SimNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
): SimNode[] {
  if (nodes.length === 0) return nodes;

  const cx = width / 2;
  const cy = height / 2;

  // Place nodes in a circle initially
  const placed = nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    const r = Math.min(width, height) * 0.35;
    return {
      ...n,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      vx: 0,
      vy: 0,
    };
  });

  // Build id → index map
  const idxMap: Record<string, number> = {};
  placed.forEach((n, i) => { idxMap[n.id] = i; });

  const REPULSION = 4000;
  const SPRING_K = 0.08;
  const SPRING_REST = 160;
  const GRAVITY_K = 0.03;
  const DAMPING = 0.8;
  const ITERATIONS = 300;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Reset forces
    for (const n of placed) { n.vx = 0; n.vy = 0; }

    // Repulsion between all pairs
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = REPULSION / (dist * dist);
        dx /= dist;
        dy /= dist;
        a.vx += dx * force;
        a.vy += dy * force;
        b.vx -= dx * force;
        b.vy -= dy * force;
      }
    }

    // Spring forces along edges
    for (const edge of edges) {
      const si = idxMap[edge.source];
      const ti = idxMap[edge.target];
      if (si === undefined || ti === undefined) continue;
      const a = placed[si];
      const b = placed[ti];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = SPRING_K * (dist - SPRING_REST);
      a.vx += (dx / dist) * force;
      a.vy += (dy / dist) * force;
      b.vx -= (dx / dist) * force;
      b.vy -= (dy / dist) * force;
    }

    // Gravity toward center
    for (const n of placed) {
      n.vx += (cx - n.x) * GRAVITY_K;
      n.vy += (cy - n.y) * GRAVITY_K;
    }

    // Integrate with damping
    for (const n of placed) {
      n.x += n.vx * DAMPING;
      n.y += n.vy * DAMPING;
    }
  }

  return placed;
}

// ---------------------------------------------------------------------------
// Legend items
// ---------------------------------------------------------------------------

const LEGEND = [
  { label: 'Endpoint', color: '#08D4B8' },
  { label: 'Policy', color: '#3B5CAA' },
  { label: 'Risk', color: '#FFB547' },
  { label: 'Incident', color: '#E31A1A' },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PolicyGraphPage() {
  usePageHeader('Policy Relationship Graph', 'Visualise how policies, endpoints, risks, and incidents are connected');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');
  const sidebarBg = useColorModeValue('white', 'navy.800');
  const mutedText = useColorModeValue('gray.500', 'gray.400');
  const svgBg = useColorModeValue('#F8FAFF', '#0b1437');
  const edgeColor = useColorModeValue('#CBD5E0', '#4A5568');

  // Filters
  const [policyType, setPolicyType] = useState<string>('');
  const [endpointStatus, setEndpointStatus] = useState<string>('');
  const [riskSeverity, setRiskSeverity] = useState<string>('');
  const [includeIncidents, setIncludeIncidents] = useState(false);

  // Visibility toggles
  const [showEndpoints, setShowEndpoints] = useState(true);
  const [showPolicies, setShowPolicies] = useState(true);
  const [showRisks, setShowRisks] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);

  // Graph state
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);

  // Zoom / pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, loading, error, refetch } = useQuery(GET_POLICY_GRAPH, {
    variables: {
      policyType: policyType || null,
      endpointStatus: endpointStatus || null,
      riskSeverity: riskSeverity || null,
      includeIncidents,
    },
    fetchPolicy: 'cache-and-network',
  });

  const graphData = data?.policyGraph;

  // Determine SVG canvas size
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setCanvasSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Run simulation whenever data or canvas changes
  useEffect(() => {
    if (!graphData) return;
    const rawNodes: SimNode[] = graphData.nodes.map((n: GraphNode) => ({
      ...n,
      x: 0, y: 0, vx: 0, vy: 0,
    }));
    const result = runSimulation(rawNodes, graphData.edges, canvasSize.w, canvasSize.h);
    setSimNodes(result);
  }, [graphData, canvasSize.w, canvasSize.h]);

  // Zoom via wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => {
      const next = z - e.deltaY * 0.001;
      return Math.min(2.5, Math.max(0.3, next));
    });
  }, []);

  // Pan via drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as SVGElement).closest('.graph-node')) return; // don't pan on node click
    isPanning.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Filter visible nodes/edges
  const visibleNodeIds = new Set(
    simNodes
      .filter(n => {
        if (n.nodeType === 'endpoint' && !showEndpoints) return false;
        if (n.nodeType === 'policy' && !showPolicies) return false;
        if (n.nodeType === 'risk' && !showRisks) return false;
        if (n.nodeType === 'incident' && !showIncidents) return false;
        return true;
      })
      .map(n => n.id),
  );

  const visibleNodes = simNodes.filter(n => visibleNodeIds.has(n.id));
  const visibleEdges = (graphData?.edges ?? []).filter(
    (e: GraphEdge) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target),
  );

  // Node lookup for edge rendering
  const nodeById: Record<string, SimNode> = {};
  simNodes.forEach(n => { nodeById[n.id] = n; });

  // Truncate label for display
  const truncate = (s: string, max = 14) => s.length > max ? s.slice(0, max) + '…' : s;

  // Parse sidebar meta
  let selectedMeta: Record<string, unknown> = {};
  if (selectedNode?.meta) {
    try { selectedMeta = JSON.parse(selectedNode.meta); } catch { /* ignore */ }
  }

  const nodeTypeBadgeColor: Record<string, string> = {
    endpoint: 'teal',
    policy: 'blue',
    risk: 'orange',
    incident: 'red',
  };

  return (
    <Box>
      {/* Filters bar */}
      <Card bg={cardBg} mb="16px" p="16px">
        <Flex wrap="wrap" gap="16px" align="flex-end">
          {/* Policy type */}
          <FormControl w="180px">
            <FormLabel fontSize="xs" mb="4px" color={mutedText}>Policy type</FormLabel>
            <Select
              size="sm"
              value={policyType}
              onChange={e => setPolicyType(e.target.value)}
              borderRadius="8px"
            >
              <option value="">All types</option>
              <option value="system_prompt">System Prompt</option>
              <option value="ai_guardrail">AI Guardrail</option>
              <option value="model_restriction">Model Restriction</option>
              <option value="output_filter">Output Filter</option>
              <option value="rate_limit">Rate Limit</option>
              <option value="network_policy">Network Policy</option>
              <option value="audit_policy">Audit Policy</option>
            </Select>
          </FormControl>

          {/* Endpoint status */}
          <FormControl w="160px">
            <FormLabel fontSize="xs" mb="4px" color={mutedText}>Endpoint status</FormLabel>
            <Select
              size="sm"
              value={endpointStatus}
              onChange={e => setEndpointStatus(e.target.value)}
              borderRadius="8px"
            >
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </Select>
          </FormControl>

          {/* Risk severity */}
          <FormControl w="160px">
            <FormLabel fontSize="xs" mb="4px" color={mutedText}>Min risk severity</FormLabel>
            <Select
              size="sm"
              value={riskSeverity}
              onChange={e => setRiskSeverity(e.target.value)}
              borderRadius="8px"
            >
              <option value="">All risks</option>
              <option value="low">Low+</option>
              <option value="medium">Medium+</option>
              <option value="high">High+</option>
              <option value="critical">Critical</option>
            </Select>
          </FormControl>

          {/* Include incidents */}
          <FormControl display="flex" alignItems="flex-end" w="auto">
            <FormLabel fontSize="xs" mb="0" mr="8px" color={mutedText} htmlFor="inc-toggle">
              Incidents
            </FormLabel>
            <Switch
              id="inc-toggle"
              size="sm"
              colorScheme="brand"
              isChecked={includeIncidents}
              onChange={e => setIncludeIncidents(e.target.checked)}
            />
          </FormControl>

          <Divider orientation="vertical" h="32px" />

          {/* Visibility toggles */}
          <HStack spacing="12px" align="flex-end">
            {[
              { label: 'Endpoints', key: showEndpoints, set: setShowEndpoints, color: '#08D4B8' },
              { label: 'Policies', key: showPolicies, set: setShowPolicies, color: '#3B5CAA' },
              { label: 'Risks', key: showRisks, set: setShowRisks, color: '#FFB547' },
              { label: 'Incidents', key: showIncidents, set: setShowIncidents, color: '#E31A1A' },
            ].map(({ label, key, set, color }) => (
              <FormControl key={label} display="flex" alignItems="flex-end" w="auto">
                <FormLabel
                  fontSize="xs"
                  mb="0"
                  mr="6px"
                  color={key ? color : mutedText}
                  fontWeight={key ? 'semibold' : 'normal'}
                  htmlFor={`vis-${label}`}
                  cursor="pointer"
                >
                  {label}
                </FormLabel>
                <Switch
                  id={`vis-${label}`}
                  size="sm"
                  isChecked={key}
                  onChange={e => set(e.target.checked)}
                  sx={{ '--switch-track-bg': color }}
                />
              </FormControl>
            ))}
          </HStack>

          <Box flex="1" />

          <Button
            size="sm"
            leftIcon={<Icon as={MdRefresh} />}
            onClick={() => refetch()}
            isLoading={loading}
            colorScheme="brand"
            variant="outline"
          >
            Refresh
          </Button>
        </Flex>
      </Card>

      {/* Main graph area */}
      <Flex gap="16px" align="stretch">
        {/* SVG canvas */}
        <Box
          flex="1"
          bg={cardBg}
          borderRadius="16px"
          border="1px solid"
          borderColor={borderColor}
          overflow="hidden"
          position="relative"
          minH="620px"
        >
          {/* Stats bar */}
          <Flex
            px="16px"
            py="10px"
            borderBottom="1px solid"
            borderColor={borderColor}
            align="center"
            gap="12px"
          >
            <Icon as={MdAccountTree} color="brand.500" boxSize="18px" />
            <Text fontSize="sm" fontWeight="semibold" color={textColor}>
              {graphData ? `${graphData.nodeCount} nodes · ${graphData.edgeCount} edges` : 'Loading…'}
            </Text>
            <Text fontSize="xs" color={mutedText}>
              Scroll to zoom · drag to pan · click node for details
            </Text>
          </Flex>

          {/* SVG */}
          <Box
            ref={containerRef}
            position="relative"
            w="100%"
            h="calc(100% - 43px)"
            bg={svgBg}
            cursor={isPanning.current ? 'grabbing' : 'grab'}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {loading && simNodes.length === 0 && (
              <Flex position="absolute" inset="0" align="center" justify="center" zIndex={2}>
                <VStack>
                  <Spinner size="xl" color="brand.500" thickness="3px" />
                  <Text color={mutedText} fontSize="sm">Building graph…</Text>
                </VStack>
              </Flex>
            )}

            {!loading && graphData && graphData.nodeCount === 0 && (
              <Flex position="absolute" inset="0" align="center" justify="center" zIndex={2}>
                <VStack>
                  <Icon as={MdAccountTree} boxSize="48px" color={mutedText} />
                  <Text color={mutedText} fontWeight="semibold">No data to display</Text>
                  <Text color={mutedText} fontSize="sm">
                    Register agents, create policies, or add risks to see the graph
                  </Text>
                </VStack>
              </Flex>
            )}

            {error && (
              <Flex position="absolute" inset="0" align="center" justify="center" zIndex={2}>
                <Text color="red.400" fontSize="sm">{error.message}</Text>
              </Flex>
            )}

            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              style={{ display: 'block' }}
            >
              {/* Arrow markers */}
              <defs>
                <marker
                  id="arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L8,3 z" fill={edgeColor} />
                </marker>
                <marker
                  id="arrow-dashed"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L8,3 z" fill="#A0AEC0" />
                </marker>
              </defs>

              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {/* Edges */}
                {visibleEdges.map((edge: GraphEdge, i: number) => {
                  const src = nodeById[edge.source];
                  const tgt = nodeById[edge.target];
                  if (!src || !tgt) return null;

                  const dx = tgt.x - src.x;
                  const dy = tgt.y - src.y;
                  const len = Math.sqrt(dx * dx + dy * dy) || 1;
                  // Shorten line to node edge
                  const sx = src.x + (dx / len) * NODE_RADIUS;
                  const sy = src.y + (dy / len) * NODE_RADIUS;
                  const ex = tgt.x - (dx / len) * (NODE_RADIUS + 8);
                  const ey = tgt.y - (dy / len) * (NODE_RADIUS + 8);
                  const isDashed = edge.relationship === 'org_wide';

                  return (
                    <line
                      key={`edge-${i}`}
                      x1={sx} y1={sy}
                      x2={ex} y2={ey}
                      stroke={isDashed ? '#A0AEC0' : edgeColor}
                      strokeWidth={1.5}
                      strokeDasharray={isDashed ? '5,4' : undefined}
                      markerEnd={isDashed ? 'url(#arrow-dashed)' : 'url(#arrow)'}
                      opacity={0.7}
                    />
                  );
                })}

                {/* Nodes */}
                {visibleNodes.map(node => (
                  <g
                    key={node.id}
                    className="graph-node"
                    transform={`translate(${node.x},${node.y})`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedNode(n => n?.id === node.id ? null : node)}
                  >
                    <circle
                      r={NODE_RADIUS}
                      fill={node.color}
                      stroke={selectedNode?.id === node.id ? 'white' : 'transparent'}
                      strokeWidth={2.5}
                      opacity={0.92}
                    />
                    <text
                      y={NODE_RADIUS + 13}
                      textAnchor="middle"
                      fontSize="10"
                      fill={edgeColor}
                      fontFamily="inherit"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {truncate(node.label)}
                    </text>
                    {node.subLabel && (
                      <text
                        y={NODE_RADIUS + 24}
                        textAnchor="middle"
                        fontSize="8"
                        fill="#A0AEC0"
                        fontFamily="inherit"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {truncate(node.subLabel, 16)}
                      </text>
                    )}
                  </g>
                ))}
              </g>
            </svg>

            {/* Legend */}
            <Box
              position="absolute"
              bottom="16px"
              left="16px"
              bg={cardBg}
              borderRadius="10px"
              border="1px solid"
              borderColor={borderColor}
              p="10px 14px"
              zIndex={1}
            >
              <VStack align="start" spacing="5px">
                {LEGEND.map(item => (
                  <HStack key={item.label} spacing="8px">
                    <Box w="10px" h="10px" borderRadius="full" bg={item.color} />
                    <Text fontSize="xs" color={mutedText}>{item.label}</Text>
                  </HStack>
                ))}
                <Divider />
                <HStack spacing="8px">
                  <Box w="24px" h="1px" borderTop="1.5px dashed #A0AEC0" />
                  <Text fontSize="xs" color={mutedText}>Org-wide</Text>
                </HStack>
                <HStack spacing="8px">
                  <Box w="24px" h="1px" bg={edgeColor} />
                  <Text fontSize="xs" color={mutedText}>Direct</Text>
                </HStack>
              </VStack>
            </Box>
          </Box>
        </Box>

        {/* Detail sidebar */}
        {selectedNode && (
          <Box
            w="280px"
            bg={sidebarBg}
            borderRadius="16px"
            border="1px solid"
            borderColor={borderColor}
            p="20px"
            flexShrink={0}
          >
            <Flex justify="space-between" align="center" mb="14px">
              <Badge
                colorScheme={nodeTypeBadgeColor[selectedNode.nodeType] ?? 'gray'}
                borderRadius="6px"
                px="8px"
                py="3px"
                fontSize="xs"
                textTransform="capitalize"
              >
                {selectedNode.nodeType}
              </Badge>
              <CloseButton size="sm" onClick={() => setSelectedNode(null)} />
            </Flex>

            <Text fontWeight="bold" fontSize="md" color={textColor} mb="4px">
              {selectedNode.label}
            </Text>
            {selectedNode.subLabel && (
              <Text fontSize="xs" color={mutedText} mb="14px">
                {selectedNode.subLabel}
              </Text>
            )}

            <Divider mb="14px" />

            <VStack align="start" spacing="8px">
              {selectedNode.status && (
                <HStack w="100%" justify="space-between">
                  <Text fontSize="xs" color={mutedText}>Status</Text>
                  <Badge
                    colorScheme={
                      selectedNode.status === 'active' ? 'green' :
                      selectedNode.status === 'open' ? 'red' :
                      selectedNode.status === 'investigating' ? 'orange' : 'gray'
                    }
                    fontSize="xs"
                    borderRadius="6px"
                  >
                    {selectedNode.status}
                  </Badge>
                </HStack>
              )}

              {Object.entries(selectedMeta)
                .filter(([k]) => k !== 'href')
                .map(([key, val]) => (
                  <HStack key={key} w="100%" justify="space-between" align="flex-start">
                    <Text fontSize="xs" color={mutedText} textTransform="capitalize">
                      {key.replace(/_/g, ' ')}
                    </Text>
                    <Text fontSize="xs" color={textColor} textAlign="right" maxW="150px">
                      {String(val)}
                    </Text>
                  </HStack>
                ))
              }
            </VStack>

            {selectedMeta.href && (
              <>
                <Divider mt="16px" mb="14px" />
                <Link href={String(selectedMeta.href)}>
                  <Button
                    size="sm"
                    w="100%"
                    rightIcon={<Icon as={MdOpenInNew} />}
                    colorScheme="brand"
                    variant="outline"
                  >
                    View full page
                  </Button>
                </Link>
              </>
            )}
          </Box>
        )}
      </Flex>
    </Box>
  );
}
