
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
import cv2
import json
# pyrefly: ignore [missing-import]
from xai.rule_based import RuleBasedAnalyzer

def test_depth():
    analyzer = RuleBasedAnalyzer()
    
   
    mask = np.zeros((256, 256), dtype=np.uint8)
    cv2.circle(mask, (100, 100), 10, 1, -1)
    
    result = analyzer.calculate_tumor_depth_vector(mask)
    print("Depth Metrics:", json.dumps(result, indent=2))
    
    analyze_result = analyzer.analyze(mask)
    print("Analyze Result Depth Metrics:", json.dumps(analyze_result.get('depth_metrics'), indent=2))

if __name__ == "__main__":
    test_depth()
