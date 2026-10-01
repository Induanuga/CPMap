#!/bin/bash
# Team Graph Management Script
# Usage: bash scripts/manage_graph.sh <command>

BACKEND_URL="http://localhost:5000/api/graph"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to get JWT token (requires .env with AUTH credentials)
get_token() {
  echo -e "${BLUE}Enter your JWT token (or leave blank to skip auth):${NC}"
  read -r JWT_TOKEN
}

# Sync all career paths to Neo4j
sync_all_paths() {
  echo -e "${BLUE}📊 Syncing all approved career paths to Neo4j...${NC}"
  get_token
  
  curl -X POST "$BACKEND_URL/sync-all" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -w "\n"
  
  echo -e "${GREEN}✅ Sync complete!${NC}"
}

# Get graph statistics
get_stats() {
  echo -e "${BLUE}📈 Fetching graph statistics...${NC}"
  get_token
  
  curl -X GET "$BACKEND_URL/stats" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -w "\n"
}

# Get recommendations for a stage
get_recommendations() {
  echo -e "${BLUE}🎯 Get recommendations for which stage?${NC}"
  read -r STAGE_NAME
  
  curl -X GET "$BACKEND_URL/recommend/next-stage?stageName=$STAGE_NAME" \
    -w "\n"
  
  echo -e "${GREEN}✅ Done!${NC}"
}

# Get skills for a stage
get_stage_skills() {
  echo -e "${BLUE}💼 Get skills for which stage?${NC}"
  read -r STAGE_NAME
  
  curl -X GET "$BACKEND_URL/stage/$STAGE_NAME/skills" \
    -w "\n"
  
  echo -e "${GREEN}✅ Done!${NC}"
}

# Find paths between stages
find_paths() {
  echo -e "${BLUE}🛤️  Find path from which stage?${NC}"
  read -r FROM_STAGE
  
  echo -e "${BLUE}To which stage?${NC}"
  read -r TO_STAGE
  
  curl -X GET "$BACKEND_URL/paths?from=$FROM_STAGE&to=$TO_STAGE" \
    -w "\n"
  
  echo -e "${GREEN}✅ Done!${NC}"
}

# Show menu
show_menu() {
  echo -e "${BLUE}"
  echo "╔════════════════════════════════════════╗"
  echo "║     CPMap Neo4j Graph Manager          ║"
  echo "╚════════════════════════════════════════╝"
  echo ""
  echo "Commands:"
  echo "  1) Sync all career paths to Neo4j"
  echo "  2) Get graph statistics"
  echo "  3) Get recommendations for a stage"
  echo "  4) Get skills for a stage"
  echo "  5) Find paths between two stages"
  echo "  0) Exit"
  echo ""
  echo -e "${NC}"
}

# Main script
main() {
  if [ $# -eq 0 ]; then
    # Interactive mode
    while true; do
      show_menu
      echo -e "${BLUE}Choose an option (0-5):${NC}"
      read -r CHOICE
      
      case $CHOICE in
        1) sync_all_paths ;;
        2) get_stats ;;
        3) get_recommendations ;;
        4) get_stage_skills ;;
        5) find_paths ;;
        0) echo -e "${GREEN}Goodbye!${NC}"; exit 0 ;;
        *) echo -e "${RED}Invalid option!${NC}" ;;
      esac
      
      echo ""
      read -p "Press Enter to continue..."
    done
  else
    # Command mode
    case $1 in
      sync) sync_all_paths ;;
      stats) get_stats ;;
      recommend) get_recommendations ;;
      skills) get_stage_skills ;;
      paths) find_paths ;;
      *) echo "Unknown command: $1"; exit 1 ;;
    esac
  fi
}

main "$@"
